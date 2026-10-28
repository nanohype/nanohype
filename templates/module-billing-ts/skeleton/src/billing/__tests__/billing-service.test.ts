import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BillingConfig,
  type BillingService,
  createBillingService,
  isEntitled,
  type SubscriptionStatus,
} from "../index.js";
import { createMockProvider } from "../providers/mock.js";

// ── Billing Service ────────────────────────────────────────────────
//
// The facade end to end against the real Stripe SDK. Nothing here replaces
// the `stripe` module: webhook signatures are produced by the SDK's own
// `generateTestHeaderString` and checked by its own `constructEvent`;
// requests are encoded, keyed, and timed out by the SDK; and Stripe's
// answers become the SDK's own error classes. The one fake is the transport
// — a `fetch` the SDK sends through — so no request leaves the process.
//

const SECRET_KEY = "sk_test_nanohypeFacadeSecretKey";
const WEBHOOK_SECRET = "whsec_nanohypeFacadeSigningSecret";

interface SentRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: URLSearchParams;
}

interface Answer {
  status?: number;
  body: unknown;
}

/**
 * A Stripe API that answers from `answer` and records every request the SDK
 * sent it. An answer that throws is a request that never reached Stripe.
 */
function fakeStripeApi(answer: (request: SentRequest) => Answer) {
  const sent: SentRequest[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: SentRequest = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
    };
    sent.push(request);
    const { status = 200, body } = answer(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_fake" },
    });
  };
  return { sent, httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch) };
}

/** A transport that fails the test if anything is sent through it. */
function noNetwork() {
  return fakeStripeApi((request) => {
    throw new Error(`unexpected Stripe request: ${request.method} ${request.path}`);
  });
}

function stripeConfig(
  httpClient: Stripe.HttpClient,
  overrides: NonNullable<BillingConfig["stripe"]> = {},
): BillingConfig {
  return {
    provider: "stripe",
    stripe: {
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      // Retries sleep between attempts; every answer here is deterministic.
      maxNetworkRetries: 0,
      httpClient,
      ...overrides,
    },
  };
}

function signedEvent(event: object, secret = WEBHOOK_SECRET, timestamp?: number) {
  const payload = JSON.stringify(event, null, 2);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return { payload, header };
}

function stripeEvent(type: string, object: object, id = "evt_facade") {
  return {
    id,
    object: "event",
    api_version: "2026-01-01",
    created: 1_700_000_000,
    livemode: false,
    type,
    data: { object },
  };
}

let services: BillingService[] = [];

async function service(config: BillingConfig): Promise<BillingService> {
  const created = await createBillingService(config);
  services.push(created);
  return created;
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", undefined);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
});

afterEach(async () => {
  await Promise.all(services.map((s) => s.close()));
  services = [];
  vi.unstubAllEnvs();
});

describe("billing service webhooks on Stripe", () => {
  it("verifies a webhook Stripe signed and dispatches it, with no network call", async () => {
    const api = noNetwork();
    const billing = await service(stripeConfig(api.httpClient));
    const seen: unknown[] = [];
    billing.onWebhook("invoice.paid", async (event) => {
      seen.push(event);
    });
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_paid", object: "invoice", amount_paid: 4200 }),
    );

    const result = await billing.handleWebhook(payload, header);

    const expected = {
      id: "evt_facade",
      type: "invoice.paid",
      payload: { id: "in_paid", object: "invoice", amount_paid: 4200 },
      timestamp: "2023-11-14T22:13:20.000Z",
    };
    expect(result).toEqual({ ok: true, event: expected });
    expect(seen).toEqual([expected]);
    expect(api.sent).toEqual([]);
  });

  it("rejects a signature made with another secret and dispatches nothing", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const handler = vi.fn(async () => {});
    billing.onWebhook("invoice.paid", handler);
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_forged", object: "invoice" }),
      "whsec_someoneElsesSecret",
    );

    const result = await billing.handleWebhook(payload, header);

    expect(result.ok).toBe(false);
    expect(result.event).toBeUndefined();
    expect(result.error).toMatch(/No signatures found matching the expected signature/);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a header that is not a Stripe signature at all", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const { payload } = signedEvent(stripeEvent("invoice.paid", { id: "in_1" }));

    const result = await billing.handleWebhook(payload, "forged");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unable to extract timestamp and signatures from header/);
  });

  it("rejects a body altered after it was signed", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_1", amount_paid: 100 }),
    );

    const result = await billing.handleWebhook(
      payload.replace('"amount_paid": 100', '"amount_paid": 9'),
      header,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No signatures found matching the expected signature/);
  });

  it("rejects a signature older than the SDK's tolerance", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_1" }),
      WEBHOOK_SECRET,
      hourAgo,
    );

    const result = await billing.handleWebhook(payload, header);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Timestamp outside the tolerance zone/);
  });

  it("rejects every webhook when no signing secret is configured", async () => {
    const billing = await service(
      stripeConfig(noNetwork().httpClient, { webhookSecret: undefined }),
    );
    const { payload, header } = signedEvent(stripeEvent("invoice.paid", { id: "in_1" }));

    const result = await billing.handleWebhook(payload, header);

    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/Stripe webhook secret is required/),
    });
  });

  it.each([
    ["active", "active", true],
    ["trialing", "trialing", true],
    ["unpaid", "unpaid", false],
    ["past_due", "past_due", false],
    ["a status this module does not know", "suspended", false],
  ])(
    "hands a handler a subscription whose %s status gates access correctly",
    async (_label, status, entitled) => {
      const billing = await service(stripeConfig(noNetwork().httpClient));
      let subscription: { id: string; status: SubscriptionStatus } | undefined;
      billing.onWebhook("customer.subscription.updated", async (event) => {
        subscription = event.payload as { id: string; status: SubscriptionStatus };
      });
      const { payload, header } = signedEvent(
        stripeEvent("customer.subscription.updated", {
          id: "sub_1",
          object: "subscription",
          customer: "cus_1",
          status,
        }),
      );

      const result = await billing.handleWebhook(payload, header);

      expect(result.ok).toBe(true);
      expect(subscription?.id).toBe("sub_1");
      expect(isEntitled(subscription!.status)).toBe(entitled);
    },
  );
});

describe("billing service payments on Stripe", () => {
  it("creates a customer through the provider it initialised", async () => {
    const api = fakeStripeApi(() => ({
      body: { id: "cus_new", object: "customer", email: "a@example.com", name: "A" },
    }));
    const billing = await service(stripeConfig(api.httpClient));

    const customer = await billing.createCustomer("a@example.com", "A", { tier: "gold" });

    expect(customer).toEqual({
      id: "cus_new",
      email: "a@example.com",
      name: "A",
      externalId: "cus_new",
      metadata: { tier: "gold" },
    });
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.method).toBe("POST");
    expect(api.sent[0]?.path).toBe("/v1/customers");
    expect(api.sent[0]?.body.get("metadata[tier]")).toBe("gold");
    expect(api.sent[0]?.headers.get("authorization")).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("subscribes a customer and reports a status that grants nothing as not entitled", async () => {
    const api = fakeStripeApi(() => ({
      body: {
        id: "sub_new",
        object: "subscription",
        status: "unpaid",
        items: {
          object: "list",
          data: [
            { id: "si_1", current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 },
          ],
          has_more: false,
        },
      },
    }));
    const billing = await service(stripeConfig(api.httpClient));

    const subscription = await billing.createSubscription("cus_1", "price_1");

    expect(subscription.status).toBe("unpaid");
    expect(isEntitled(subscription.status)).toBe(false);
    expect(api.sent[0]?.path).toBe("/v1/subscriptions");
    expect(api.sent[0]?.body.get("items[0][price]")).toBe("price_1");
  });

  /** A Stripe that creates, finalizes, and pays invoices, with `pay` answered by `onPay`. */
  function invoicingApi(onPay: () => Answer = () => ({ body: { id: "in_new", status: "paid" } })) {
    return fakeStripeApi((request) => {
      if (request.path === "/v1/invoices" && request.method === "POST") {
        return { body: { id: "in_new", object: "invoice", status: "draft" } };
      }
      if (request.path === "/v1/invoiceitems") {
        return {
          body: { id: `ii_${request.body.get("metadata[metric]")}`, object: "invoiceitem" },
        };
      }
      if (request.path === "/v1/invoices/in_new/finalize") {
        return { body: { id: "in_new", object: "invoice", status: "open" } };
      }
      if (request.path === "/v1/invoices/in_new/pay") return onPay();
      throw new Error(`unexpected Stripe request: ${request.method} ${request.path}`);
    });
  }

  async function usageInvoice(billing: BillingService) {
    billing.recordUsage("cus_1", "api_calls", 10);
    billing.recordUsage("cus_1", "storage_gb", 3);
    const now = Date.now();
    return billing.generateInvoice("cus_1", {
      start: new Date(now - 60_000).toISOString(),
      end: new Date(now + 60_000).toISOString(),
    });
  }

  const billingRules: BillingConfig["pricingRules"] = [
    { metric: "api_calls", model: "per_unit", unitPrice: 5 },
    { metric: "storage_gb", model: "flat", flatAmount: 300 },
  ];

  it("charges an invoice with every write keyed by the invoice ID", async () => {
    const api = invoicingApi();
    const billing = await service({
      ...stripeConfig(api.httpClient),
      currency: "eur",
      pricingRules: billingRules,
    });
    const invoice = await usageInvoice(billing);

    const result = await billing.chargeInvoice(invoice);

    expect(result).toEqual({ ok: true, externalId: "in_new" });
    expect(api.sent.map((r) => [r.method, r.path, r.headers.get("idempotency-key")])).toEqual([
      ["POST", "/v1/invoices", `billing-invoice:${invoice.id}:create`],
      ["POST", "/v1/invoiceitems", `billing-invoice:${invoice.id}:item-0`],
      ["POST", "/v1/invoiceitems", `billing-invoice:${invoice.id}:item-1`],
      ["POST", "/v1/invoices/in_new/finalize", `billing-invoice:${invoice.id}:finalize`],
      ["POST", "/v1/invoices/in_new/pay", `billing-invoice:${invoice.id}:pay`],
    ]);
    const [create, apiCalls, storage] = api.sent;
    expect(create?.body.get("currency")).toBe("eur");
    expect(create?.body.get("metadata[invoice_id]")).toBe(invoice.id);
    expect(apiCalls?.body.get("amount")).toBe("50");
    expect(apiCalls?.body.get("metadata[metric]")).toBe("api_calls");
    expect(storage?.body.get("amount")).toBe("300");
    expect(storage?.body.get("metadata[metric]")).toBe("storage_gb");
  });

  it("replays a retried charge under the keys the first attempt used", async () => {
    let payAttempts = 0;
    const api = invoicingApi(() => {
      payAttempts++;
      if (payAttempts === 1) throw new TypeError("fetch failed");
      return { body: { id: "in_new", object: "invoice", status: "paid" } };
    });
    const billing = await service({ ...stripeConfig(api.httpClient), pricingRules: billingRules });
    const invoice = await usageInvoice(billing);

    const first = await billing.chargeInvoice(invoice);
    const firstKeys = api.sent.map((r) => r.headers.get("idempotency-key"));
    api.sent.length = 0;
    const retry = await billing.chargeInvoice(invoice);
    const retryKeys = api.sent.map((r) => r.headers.get("idempotency-key"));

    expect(first.ok).toBe(false);
    expect(first.externalId).toBe("in_new");
    expect(retry).toEqual({ ok: true, externalId: "in_new" });
    expect(retryKeys).toEqual(firstKeys);
    expect(new Set(firstKeys).size).toBe(firstKeys.length);
  });

  it("reports a declined card and keeps charging other customers", async () => {
    const api = invoicingApi(() => ({
      status: 402,
      body: {
        error: { type: "card_error", code: "card_declined", message: "Your card was declined." },
      },
    }));
    const billing = await service({ ...stripeConfig(api.httpClient), pricingRules: billingRules });

    for (let attempt = 0; attempt < 7; attempt++) {
      const invoice = await usageInvoice(billing);
      const result = await billing.chargeInvoice(invoice);
      expect(result).toEqual({ ok: false, externalId: "in_new", error: "Your card was declined." });
    }

    const payRequests = api.sent.filter((r) => r.path.endsWith("/pay"));
    expect(payRequests).toHaveLength(7);
  });

  it("stops calling Stripe once it answers with five server errors", async () => {
    const api = fakeStripeApi(() => ({
      status: 500,
      body: { error: { type: "api_error", message: "Stripe is having a moment" } },
    }));
    const billing = await service(stripeConfig(api.httpClient));

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(billing.createCustomer("a@example.com", "A")).rejects.toThrow(
        "Stripe is having a moment",
      );
    }
    await expect(billing.createCustomer("a@example.com", "A")).rejects.toThrow(
      /Circuit breaker is open/,
    );

    expect(api.sent).toHaveLength(5);
  });

  it("stops calling Stripe once five requests fail to connect", async () => {
    const api = fakeStripeApi(() => {
      throw new TypeError("fetch failed");
    });
    const billing = await service(stripeConfig(api.httpClient));

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(billing.createCustomer("a@example.com", "A")).rejects.toThrow(
        /error occurred with our connection to Stripe/,
      );
    }
    await expect(billing.createCustomer("a@example.com", "A")).rejects.toThrow(
      /Circuit breaker is open/,
    );

    expect(api.sent).toHaveLength(5);
  });

  it("abandons a request that outlives the configured timeout", async () => {
    const hanging = Stripe.createFetchHttpClient(
      ((_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })) as typeof fetch,
    );
    const billing = await service(stripeConfig(hanging, { timeoutMs: 25 }));

    await expect(billing.createCustomer("a@example.com", "A")).rejects.toThrow(/timeout/i);
  });

  it("lists every invoice across pages, with each line's metric", async () => {
    const line = (id: string, metric?: string) => ({
      id,
      object: "line_item",
      description: `line ${id}`,
      quantity: 1,
      amount: 100,
      pricing: { unit_amount_decimal: "100" },
      metadata: metric ? { metric } : {},
    });
    const invoice = (id: string, lines: object) => ({
      id,
      object: "invoice",
      period_start: 1_700_000_000,
      period_end: 1_702_592_000,
      lines,
      total: 100,
      currency: "usd",
      status: "paid",
      created: 1_700_000_000,
    });
    const api = fakeStripeApi((request) => {
      if (request.path === "/v1/invoices" && !request.query.has("starting_after")) {
        return {
          body: {
            object: "list",
            data: [
              invoice("in_1", {
                object: "list",
                data: [line("il_1", "api_calls")],
                has_more: true,
              }),
            ],
            has_more: true,
          },
        };
      }
      if (request.path === "/v1/invoices") {
        return {
          body: {
            object: "list",
            data: [invoice("in_2", { object: "list", data: [line("il_9")], has_more: false })],
            has_more: false,
          },
        };
      }
      if (request.path === "/v1/invoices/in_1/lines") {
        return {
          body: { object: "list", data: [line("il_2", "storage_gb")], has_more: false },
        };
      }
      throw new Error(`unexpected Stripe request: ${request.method} ${request.path}`);
    });
    const billing = await service(stripeConfig(api.httpClient));

    const invoices = await billing.listInvoices("cus_1");

    expect(invoices.map((i) => [i.id, i.lineItems.map((l) => l.metric)])).toEqual([
      ["in_1", ["api_calls", "storage_gb"]],
      ["in_2", [""]],
    ]);
    expect(api.sent.map((r) => `${r.path}?${r.query}`)).toEqual([
      "/v1/invoices?customer=cus_1&limit=100",
      "/v1/invoices?customer=cus_1&limit=100&starting_after=in_1",
      "/v1/invoices/in_1/lines?limit=100&starting_after=il_1",
    ]);
  });
});

describe("billing service on the mock provider", () => {
  const period = () => {
    const now = Date.now();
    return {
      start: new Date(now - 60_000).toISOString(),
      end: new Date(now + 60_000).toISOString(),
    };
  };

  it("meters usage, invoices it, charges it, and lists it", async () => {
    const billing = await service({
      provider: "mock",
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 2 }],
    });
    billing.recordUsage("cus-1", "api_calls", 10, { endpoint: "/v1/chat" });

    const summary = billing.getUsageSummary("cus-1", period());
    const invoice = billing.generateInvoice("cus-1", period());
    const charged = await billing.chargeInvoice(invoice);
    const listed = await billing.listInvoices("cus-1");

    expect(billing.provider).toBe("mock");
    expect(summary.totalByMetric).toEqual({ api_calls: 10 });
    expect(invoice.totalAmount).toBe(20);
    expect(billing.formatInvoice(invoice, "markdown")).toContain("**Total:** $0.20");
    expect(charged).toEqual({ ok: true, externalId: "mock-pi-1" });
    expect(listed).toEqual([{ ...invoice, status: "paid", externalId: "mock-pi-1" }]);
  });

  it("charges an invoice once however many times it is charged", async () => {
    const billing = await service({ provider: "mock" });
    billing.recordUsage("cus-1", "api_calls", 1);
    const invoice = billing.generateInvoice("cus-1", period());

    const first = await billing.chargeInvoice(invoice);
    const again = await billing.chargeInvoice(invoice);

    expect(again).toEqual(first);
    expect(await billing.listInvoices("cus-1")).toHaveLength(1);
  });

  it("creates customers and subscriptions", async () => {
    const billing = await service({ provider: "mock" });

    const customer = await billing.createCustomer("a@example.com", "A");
    const tagged = await billing.createCustomer("b@example.com", "B", { tier: "gold" });
    const subscription = await billing.createSubscription(customer.id, "plan-pro");

    expect(customer).toMatchObject({ id: "mock-cus-1", metadata: {} });
    expect(tagged).toMatchObject({ id: "mock-cus-2", metadata: { tier: "gold" } });
    expect(subscription).toMatchObject({ id: "mock-sub-1", customerId: "mock-cus-1" });
    expect(isEntitled(subscription.status)).toBe(true);
  });

  it("parses webhook bodies, naming an event that carries no ID", async () => {
    const billing = await service({ provider: "mock" });

    const withId = await billing.handleWebhook(
      JSON.stringify({ id: "evt_given", type: "invoice.paid", data: { id: "in_1" } }),
      "any",
    );
    const bare = await billing.handleWebhook(JSON.stringify({ hello: "world" }), "any");
    const broken = await billing.handleWebhook("not-json{", "any");

    expect(withId.event).toMatchObject({
      id: "evt_given",
      type: "invoice.paid",
      payload: { id: "in_1" },
    });
    expect(bare.event).toMatchObject({
      id: "mock-evt-2",
      type: "unknown",
      payload: { hello: "world" },
    });
    expect(broken).toEqual({ ok: false, error: "Invalid webhook payload: not valid JSON" });
  });

  it("forgets everything on close", async () => {
    const provider = createMockProvider();
    await provider.init({ provider: "mock" });
    await provider.createCustomer("a@example.com", "A");

    await provider.close();
    await provider.init({ provider: "mock" });

    expect(await provider.createCustomer("b@example.com", "B")).toMatchObject({ id: "mock-cus-1" });
  });
});

describe("mock provider selection", () => {
  it("refuses to start when the config does not name it", async () => {
    await expect(createMockProvider().init({})).rejects.toThrow(/runs only when named/);
  });

  it("refuses to start when the config names another provider", async () => {
    await expect(createMockProvider().init({ provider: "stripe" })).rejects.toThrow(
      /runs only when named/,
    );
  });

  it("never comes up when the config names no provider", async () => {
    // Whatever the project's default provider is, a config that names none
    // and supplies no credentials starts nothing: a registered real provider
    // refuses without its key, an unregistered name is not found, and the
    // mock refuses to be anyone's default.
    await expect(createBillingService({})).rejects.toThrow();
  });
});

describe("billing config validation", () => {
  it.each([
    ["a currency that is not three letters", { provider: "mock", currency: "dollars" }],
    ["an empty provider name", { provider: "" }],
    ["a negative timeout", { provider: "mock", stripe: { timeoutMs: -1 } }],
    ["a fractional retry count", { provider: "mock", stripe: { maxNetworkRetries: 1.5 } }],
    ["an HTTP client that is a string", { provider: "mock", stripe: { httpClient: "fetch" } }],
    ["an HTTP client that is null", { provider: "mock", stripe: { httpClient: null } }],
    ["an HTTP client with no makeRequest", { provider: "mock", stripe: { httpClient: {} } }],
  ])("rejects %s before any provider starts", async (_label, config) => {
    await expect(createBillingService(config as BillingConfig)).rejects.toThrow(
      /^Invalid billing config: /,
    );
  });

  it("accepts an HTTP client that implements makeRequest", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));

    expect(billing.provider).toBe("stripe");
  });
});

describe("isEntitled", () => {
  it.each([
    ["active", true],
    ["trialing", true],
    ["incomplete", false],
    ["incomplete_expired", false],
    ["past_due", false],
    ["unpaid", false],
    ["paused", false],
    ["canceled", false],
  ] as const)("reads %s as entitled: %s", (status, entitled) => {
    expect(isEntitled(status)).toBe(entitled);
  });
});
