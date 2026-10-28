import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BillingConfig,
  type BillingPeriod,
  type BillingService,
  createBillingService,
  DEFAULT_PROVIDER,
  deriveInvoiceId,
  type Invoice,
  isEntitled,
  ProviderConfigError,
  registerProvider,
  type SubscriptionStatus,
} from "../index.js";
import { billingChargeCalls, billingPaymentTotal } from "../metrics.js";
import { createMockProvider } from "../providers/mock.js";
import {
  fakeStripeAccount,
  fakeStripeApi,
  hangingStripeApi,
  noNetwork,
  signedEvent,
  stripeEvent,
  stripeRefusal,
} from "./fake-stripe.js";

// ── Billing Service ────────────────────────────────────────────────
//
// The facade end to end against the real Stripe SDK. Nothing here replaces
// the `stripe` module: webhook signatures are produced by the SDK's own
// `generateTestHeaderString` and checked by its own `constructEvent`;
// requests are encoded, keyed, and timed out by the SDK; and Stripe's
// answers become the SDK's own error classes. The one fake is the transport
// — a `fetch` the SDK sends through (fake-stripe.ts) — so no request leaves
// the process.
//

const SECRET_KEY = "sk_test_nanohypeFacadeSecretKey";
const WEBHOOK_SECRET = "whsec_nanohypeFacadeSigningSecret";

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

const signed = (event: object, secret = WEBHOOK_SECRET, timestamp?: number) =>
  signedEvent(event, secret, timestamp);

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
  vi.restoreAllMocks();
});

describe("billing service webhooks on Stripe", () => {
  it("verifies a webhook Stripe signed and dispatches it, with no network call", async () => {
    const api = noNetwork();
    const billing = await service(stripeConfig(api.httpClient));
    const seen: unknown[] = [];
    billing.onWebhook("invoice.paid", async (event) => {
      seen.push(event);
    });
    const { payload, header } = signed(
      stripeEvent("invoice.paid", { id: "in_paid", object: "invoice", amount_paid: 4200 }),
    );

    const result = await billing.handleWebhook(payload, header);

    const expected = {
      id: "evt_fake",
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
    const { payload, header } = signed(
      stripeEvent("invoice.paid", { id: "in_forged", object: "invoice" }),
      "whsec_someoneElsesSecret",
    );

    const result = await billing.handleWebhook(payload, header);

    expect(result).toEqual({
      ok: false,
      reason: "unverified",
      error: expect.stringMatching(/No signatures found matching the expected signature/),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a header that is not a Stripe signature at all", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const { payload } = signed(stripeEvent("invoice.paid", { id: "in_1" }));

    const result = await billing.handleWebhook(payload, "forged");

    expect(result).toMatchObject({
      ok: false,
      reason: "unverified",
      error: expect.stringMatching(/Unable to extract timestamp and signatures from header/),
    });
  });

  it("rejects a body altered after it was signed", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const { payload, header } = signed(
      stripeEvent("invoice.paid", { id: "in_1", amount_paid: 100 }),
    );

    const result = await billing.handleWebhook(
      payload.replace('"amount_paid": 100', '"amount_paid": 9'),
      header,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "unverified",
      error: expect.stringMatching(/No signatures found matching the expected signature/),
    });
  });

  it("rejects a signature older than the SDK's tolerance", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    const { payload, header } = signed(
      stripeEvent("invoice.paid", { id: "in_1" }),
      WEBHOOK_SECRET,
      hourAgo,
    );

    const result = await billing.handleWebhook(payload, header);

    expect(result).toMatchObject({
      ok: false,
      reason: "unverified",
      error: expect.stringMatching(/Timestamp outside the tolerance zone/),
    });
  });

  it("reports every webhook as misconfigured, not unverified, when no signing secret is configured", async () => {
    const billing = await service(
      stripeConfig(noNetwork().httpClient, { webhookSecret: undefined }),
    );
    const handler = vi.fn();
    billing.onWebhook("invoice.paid", handler);
    const { payload, header } = signed(stripeEvent("invoice.paid", { id: "in_1" }));

    const result = await billing.handleWebhook(payload, header);

    expect(result).toEqual({
      ok: false,
      reason: "misconfigured",
      error:
        "Stripe webhook secret is required. Set config.stripe.webhookSecret or STRIPE_WEBHOOK_SECRET env var.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("reports a webhook that arrives after close as misconfigured", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));
    const { payload, header } = signed(stripeEvent("invoice.paid", { id: "in_1" }));
    await billing.close();

    const result = await billing.handleWebhook(payload, header);

    expect(result).toEqual({
      ok: false,
      reason: "misconfigured",
      error: "Stripe provider not initialized",
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
      const { payload, header } = signed(
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
  it("creates a customer through the provider it initialized", async () => {
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

  /** A period around now, so usage recorded now falls inside it. */
  function currentPeriod(): BillingPeriod {
    const now = Date.now();
    return {
      start: new Date(now - 60_000).toISOString(),
      end: new Date(now + 60_000).toISOString(),
    };
  }

  function usageInvoice(billing: BillingService, customerId = "cus_1", period = currentPeriod()) {
    billing.recordUsage(customerId, "api_calls", 10);
    billing.recordUsage(customerId, "storage_gb", 3);
    return billing.generateInvoice(customerId, period);
  }

  const billingRules: BillingConfig["pricingRules"] = [
    { metric: "api_calls", model: "per_unit", unitPrice: 5 },
    { metric: "storage_gb", model: "flat", flatAmount: 300 },
  ];

  const LOOKUP = ["GET", "/v1/invoices", null];

  it("charges an invoice with every POST keyed by the invoice ID and its step", async () => {
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      currency: "eur",
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    const result = await billing.chargeInvoice(invoice);

    expect(result).toEqual({ ok: true, externalId: "in_1", collected: 350 });
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoices", `billing-invoice:${invoice.id}:create`],
      ["POST", "/v1/invoiceitems", `billing-invoice:${invoice.id}:in_1:item-0`],
      ["POST", "/v1/invoiceitems", `billing-invoice:${invoice.id}:in_1:item-1`],
      ["POST", "/v1/invoices/in_1/finalize", `billing-invoice:${invoice.id}:in_1:finalize`],
      ["POST", "/v1/invoices/in_1/pay", `billing-invoice:${invoice.id}:in_1:pay`],
    ]);
    const [, create, apiCalls, storage] = account.sent;
    expect(create?.body.get("currency")).toBe("eur");
    expect(create?.body.get("metadata[invoice_id]")).toBe(invoice.id);
    expect(apiCalls?.body.get("amount")).toBe("50");
    expect(apiCalls?.body.get("metadata[metric]")).toBe("api_calls");
    expect(storage?.body.get("amount")).toBe("300");
    expect(storage?.body.get("metadata[metric]")).toBe("storage_gb");
  });

  it("resumes a charge whose payment never reached Stripe", async () => {
    let payAttempts = 0;
    const account = fakeStripeAccount((request, apply) => {
      if (request.path.endsWith("/pay") && ++payAttempts === 1) {
        throw new TypeError("fetch failed");
      }
      return apply();
    });
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    const first = await billing.chargeInvoice(invoice);
    account.sent.length = 0;
    const retry = await billing.chargeInvoice(invoice);

    expect(first).toMatchObject({ ok: false, code: "unavailable", externalId: "in_1" });
    expect(retry).toEqual({ ok: true, externalId: "in_1", collected: 350 });
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoices/in_1/pay", `billing-invoice:${invoice.id}:in_1:pay`],
    ]);
  });

  it("charges an invoice once even after Stripe has dropped its idempotency keys", async () => {
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    const first = await billing.chargeInvoice(invoice);
    account.forgetIdempotencyKeys();
    account.sent.length = 0;
    const replay = await billing.chargeInvoice(invoice);

    expect(first).toEqual({ ok: true, externalId: "in_1", collected: 350 });
    expect(replay).toEqual({ ok: true, externalId: "in_1", collected: 0 });
    expect(account.calls()).toEqual([LOOKUP]);
    expect(account.invoices).toMatchObject([{ status: "paid" }]);
  });

  it("charges an invoice regenerated for the same customer and period once", async () => {
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const period = currentPeriod();
    const invoice = usageInvoice(billing, "cus_1", period);

    const first = await billing.chargeInvoice(invoice);
    account.forgetIdempotencyKeys();
    account.sent.length = 0;
    const regenerated = billing.generateInvoice("cus_1", period);
    const again = await billing.chargeInvoice(regenerated);

    expect(regenerated.id).toBe(invoice.id);
    expect(again).toEqual({ ...first, collected: 0 });
    expect(account.calls()).toEqual([LOOKUP]);
    expect(account.invoices).toHaveLength(1);
  });

  /** A billing service over `account` pricing API calls at 5 each. */
  function apiCallBilling(account: ReturnType<typeof fakeStripeAccount>) {
    return service({
      ...stripeConfig(account.httpClient),
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 5 }],
    });
  }

  it("reports usage recorded after a paid charge instead of reporting the invoice paid", async () => {
    const account = fakeStripeAccount();
    const billing = await apiCallBilling(account);
    const period = currentPeriod();
    billing.recordUsage("cus_1", "api_calls", 10);
    const first = await billing.chargeInvoice(billing.generateInvoice("cus_1", period));
    billing.recordUsage("cus_1", "api_calls", 90);
    const regenerated = billing.generateInvoice("cus_1", period);
    account.sent.length = 0;

    const again = await billing.chargeInvoice(regenerated);

    expect(first).toEqual({ ok: true, externalId: "in_1", collected: 50 });
    expect(regenerated.totalAmount).toBe(500);
    expect(again).toEqual({
      ok: false,
      code: "invoice_content_changed",
      externalId: "in_1",
      billedAmount: 50,
      error: `Stripe invoice in_1 bills 50 usd for invoice ${regenerated.id}, which totals 500 usd`,
    });
    expect(account.calls()).toEqual([LOOKUP]);
  });

  it("reports usage recorded after a declined charge instead of paying the open invoice", async () => {
    let declining = true;
    const account = fakeStripeAccount((request, apply) =>
      declining && request.path.endsWith("/pay")
        ? stripeRefusal(402, "Your card was declined.", "card_error")
        : apply(),
    );
    const billing = await apiCallBilling(account);
    const period = currentPeriod();
    billing.recordUsage("cus_1", "api_calls", 10);
    const first = await billing.chargeInvoice(billing.generateInvoice("cus_1", period));
    declining = false;
    billing.recordUsage("cus_1", "api_calls", 90);
    account.sent.length = 0;

    const again = await billing.chargeInvoice(billing.generateInvoice("cus_1", period));

    expect(first).toMatchObject({ ok: false, code: "declined", externalId: "in_1" });
    expect(again).toMatchObject({
      ok: false,
      code: "invoice_content_changed",
      externalId: "in_1",
      billedAmount: 50,
    });
    expect(account.calls()).toEqual([LOOKUP]);
    expect(account.invoices).toMatchObject([{ status: "open" }]);
  });

  it("bills usage recorded after a charge once, under the period's next invoices", async () => {
    const account = fakeStripeAccount();
    const billing = await apiCallBilling(account);
    const period = currentPeriod();
    /** What Stripe holds billed for the customer, summed over every invoice's lines. */
    const stripeBilled = () =>
      account.invoices.flatMap((inv) => inv.lines).reduce((sum, line) => sum + line.amount, 0);

    billing.recordUsage("cus_1", "api_calls", 10);
    const first = billing.generateInvoice("cus_1", period);
    const firstCharge = await billing.chargeInvoice(first);
    billing.recordUsage("cus_1", "api_calls", 90);
    const regenerated = await billing.chargeInvoice(billing.generateInvoice("cus_1", period));

    const late = billing.generateInvoice("cus_1", period, { billed: [first] });
    const lateCharge = await billing.chargeInvoice(late);
    account.forgetIdempotencyKeys();
    const lateAgain = await billing.chargeInvoice(
      billing.generateInvoice("cus_1", period, { billed: [first] }),
    );

    billing.recordUsage("cus_1", "api_calls", 20);
    const later = billing.generateInvoice("cus_1", period, { billed: [late, first] });
    const laterCharge = await billing.chargeInvoice(later);

    expect(firstCharge).toEqual({ ok: true, externalId: "in_1", collected: 50 });
    expect(regenerated).toMatchObject({
      ok: false,
      code: "invoice_content_changed",
      billedAmount: 50,
    });
    expect(late.id).toBe(deriveInvoiceId("cus_1", period, 1));
    expect(late.lineItems).toEqual([
      {
        description: "api_calls — 100 units @ 5/unit (90 not yet billed)",
        metric: "api_calls",
        quantity: 90,
        unitPrice: 5,
        amount: 450,
      },
    ]);
    expect(lateCharge).toMatchObject({ ok: true, collected: 450 });
    expect(lateAgain).toEqual({ ...lateCharge, collected: 0 });
    expect(later.id).toBe(deriveInvoiceId("cus_1", period, 2));
    expect(laterCharge).toMatchObject({ ok: true, collected: 100 });
    expect(account.invoices.map((inv) => inv.status)).toEqual(["paid", "paid", "paid"]);
    // 120 API calls at 5 each, billed once across the three invoices.
    expect(billing.getUsageSummary("cus_1", period).lineItems[0]?.amount).toBe(600);
    expect(stripeBilled()).toBe(600);
  });

  it("bills late usage once from the invoices listInvoices lists, at the quantity and unit price charged", async () => {
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 2 }],
    });
    const period = currentPeriod();
    billing.recordUsage("cus_1", "api_calls", 1000);
    const first = billing.generateInvoice("cus_1", period);
    await billing.chargeInvoice(first);

    const listed = await billing.listInvoices("cus_1");
    billing.recordUsage("cus_1", "api_calls", 100);
    const late = billing.generateInvoice("cus_1", period, { billed: listed });
    const lateCharge = await billing.chargeInvoice(late);

    expect(listed.map(({ id, lineItems }) => ({ id, lineItems }))).toEqual([
      { id: first.id, lineItems: first.lineItems },
    ]);
    expect(late.id).toBe(deriveInvoiceId("cus_1", period, 1));
    expect(late.lineItems).toEqual([
      {
        description: "api_calls — 1100 units @ 2/unit (100 not yet billed)",
        metric: "api_calls",
        quantity: 100,
        unitPrice: 2,
        amount: 200,
      },
    ]);
    expect(late.totalAmount).toBe(200);
    expect(lateCharge).toMatchObject({ ok: true, collected: 200 });
  });

  it("refuses as billed a listed invoice with a line that names no metric", async () => {
    const account = fakeStripeAccount();
    const billing = await apiCallBilling(account);
    const period = currentPeriod();
    const id = deriveInvoiceId("cus_1", period, 0);
    // An invoice made in Stripe by hand under an ID this module derives: its
    // line carries none of the metadata chargeInvoice writes.
    account.seed({
      customer: "cus_1",
      currency: "usd",
      status: "paid",
      metadata: { invoice_id: id },
      lines: [{ id: "il_hand", amount: 500, description: "Consulting", metadata: {} }],
    });
    billing.recordUsage("cus_1", "api_calls", 10);

    const listed = await billing.listInvoices("cus_1");

    expect(() => billing.generateInvoice("cus_1", period, { billed: listed })).toThrow(
      `Invoice ${id} line 0 names no metric or quantity it billed; billed takes the invoices generateInvoice returned, or listInvoices lists under the ID they were charged under`,
    );
  });

  it("bills a line whose amount changed in a draft an earlier charge left at its new amount", async () => {
    const controller = new AbortController();
    const account = fakeStripeAccount((request, apply) => {
      const answer = apply();
      if (request.method === "POST" && request.path === "/v1/invoiceitems") controller.abort();
      return answer;
    });
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const period = currentPeriod();
    const stopped = await billing.chargeInvoice(usageInvoice(billing, "cus_1", period), {
      signal: controller.signal,
    });
    billing.recordUsage("cus_1", "api_calls", 90);
    const regenerated = billing.generateInvoice("cus_1", period);

    const result = await billing.chargeInvoice(regenerated);

    expect(stopped).toMatchObject({ ok: false, code: "aborted", externalId: "in_1" });
    expect(regenerated.lineItems.map((line) => line.amount)).toEqual([500, 300]);
    expect(result).toEqual({ ok: true, externalId: "in_4", collected: 800 });
    expect(account.invoices).toMatchObject([
      { id: "in_4", status: "paid", lines: [{ amount: 500 }, { amount: 300 }] },
    ]);
  });

  /**
   * The adds to billing_payment_total, which carry a `currency`, and to
   * billing_charge_calls, which carry a `result`. With no OTel SDK installed,
   * the API hands every counter one shared no-op instance, so one spy sees
   * every counter's adds and each is told apart by its attributes.
   */
  function metricAdds() {
    const add = vi.spyOn(billingPaymentTotal, "add");
    const labeled = (key: string) => () =>
      add.mock.calls.filter(([, attributes]) => attributes?.[key] !== undefined);
    expect(billingChargeCalls.add).toBe(billingPaymentTotal.add);
    return { amounts: labeled("currency"), calls: labeled("result") };
  }

  it("counts toward the payment metric only what each charge collected, by currency", async () => {
    const { amounts, calls } = metricAdds();
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      currency: "EUR",
      pricingRules: billingRules,
    });
    const period = currentPeriod();
    const invoice = usageInvoice(billing, "cus_1", period);

    await billing.chargeInvoice(invoice);
    await billing.chargeInvoice(billing.generateInvoice("cus_1", period));

    expect(amounts()).toEqual([
      [350, { currency: "eur" }],
      [0, { currency: "eur" }],
    ]);
    expect(calls()).toEqual([
      [1, { result: "paid" }],
      [1, { result: "paid" }],
    ]);
  });

  it("counts a payment two charges raced to make once", async () => {
    const { amounts } = metricAdds();
    let hidden = false;
    const account = fakeStripeAccount((request, apply) =>
      hidden && request.method === "GET" && request.path === "/v1/invoices"
        ? { body: { object: "list", data: [], has_more: false } }
        : apply(),
    );
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    const first = await billing.chargeInvoice(invoice);
    // The second charge's lookup ran before the first created anything, so
    // it repeats every write the first made, under the same keys.
    hidden = true;
    const second = await billing.chargeInvoice(invoice);

    expect(first).toEqual({ ok: true, externalId: "in_1", collected: 350 });
    expect(second).toEqual({ ok: true, externalId: "in_1", collected: 0 });
    expect(amounts()).toEqual([
      [350, { currency: "usd" }],
      [0, { currency: "usd" }],
    ]);
    expect(account.invoices).toMatchObject([{ id: "in_1", status: "paid" }]);
  });

  it("counts each failed charge call once under its code, adding no amount", async () => {
    const { amounts, calls } = metricAdds();
    const account = fakeStripeAccount((request, apply) =>
      request.path.endsWith("/pay")
        ? stripeRefusal(402, "Your card was declined.", "card_error")
        : apply(),
    );
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    await billing.chargeInvoice(invoice);
    await billing.chargeInvoice(invoice);

    expect(amounts()).toEqual([]);
    expect(calls()).toEqual([
      [1, { result: "declined" }],
      [1, { result: "declined" }],
    ]);
  });

  it("starts no Stripe call for a charge whose signal has aborted", async () => {
    const account = fakeStripeAccount();
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });
    const invoice = usageInvoice(billing);

    const result = await billing.chargeInvoice(invoice, { signal: AbortSignal.abort() });

    expect(result).toEqual({ ok: false, code: "aborted", error: "This operation was aborted" });
    expect(account.sent).toEqual([]);
  });

  it("reports a declined card and keeps charging other customers", async () => {
    const account = fakeStripeAccount((request, apply) =>
      request.path.endsWith("/pay")
        ? stripeRefusal(402, "Your card was declined.", "card_error")
        : apply(),
    );
    const billing = await service({
      ...stripeConfig(account.httpClient),
      pricingRules: billingRules,
    });

    for (let attempt = 0; attempt < 7; attempt++) {
      const invoice = usageInvoice(billing, `cus_${attempt}`);
      const result = await billing.chargeInvoice(invoice);
      expect(result).toEqual({
        ok: false,
        code: "declined",
        externalId: account.invoices.at(-1)?.id,
        error: "Your card was declined.",
      });
    }

    expect(account.sent.filter((r) => r.path.endsWith("/pay"))).toHaveLength(7);
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
    const billing = await service(stripeConfig(hangingStripeApi().httpClient, { timeoutMs: 25 }));

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
    expect(charged).toEqual({ ok: true, externalId: "mock-pi-1", collected: 20 });
    expect(listed).toEqual([{ ...invoice, status: "paid", externalId: "mock-pi-1" }]);
  });

  it("charges an invoice once however many times it is charged", async () => {
    const billing = await service({
      provider: "mock",
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 2 }],
    });
    billing.recordUsage("cus-1", "api_calls", 1);
    const invoice = billing.generateInvoice("cus-1", period());

    const first = await billing.chargeInvoice(invoice);
    const again = await billing.chargeInvoice(invoice);

    expect(first).toEqual({ ok: true, externalId: "mock-pi-1", collected: 2 });
    expect(again).toEqual({ ok: true, externalId: "mock-pi-1", collected: 0 });
    expect(await billing.listInvoices("cus-1")).toHaveLength(1);
  });

  it("reports usage recorded after a charge instead of reporting the invoice paid", async () => {
    const billing = await service({
      provider: "mock",
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 5 }],
    });
    const billed = period();
    billing.recordUsage("cus-1", "api_calls", 10);
    const first = await billing.chargeInvoice(billing.generateInvoice("cus-1", billed));
    billing.recordUsage("cus-1", "api_calls", 90);
    const regenerated = billing.generateInvoice("cus-1", billed);

    const again = await billing.chargeInvoice(regenerated);

    expect(first).toEqual({ ok: true, externalId: "mock-pi-1", collected: 50 });
    expect(again).toEqual({
      ok: false,
      code: "invoice_content_changed",
      externalId: "mock-pi-1",
      billedAmount: 50,
      error: `Mock charge mock-pi-1 bills 50 usd for invoice ${regenerated.id}, which totals 500 usd`,
    });
  });

  const charged: Invoice = {
    id: "inv-mock",
    customerId: "cus-1",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    lineItems: [
      { description: "API calls", metric: "api_calls", quantity: 10, unitPrice: 5, amount: 50 },
    ],
    totalAmount: 50,
    currency: "usd",
    status: "draft",
    createdAt: "2026-02-01T00:00:00.000Z",
  };
  const line = charged.lineItems[0] as Invoice["lineItems"][number];

  it.each([
    ["a currency", { currency: "eur" }],
    ["a line count", { lineItems: [line, line] }],
    ["a line's amount", { lineItems: [{ ...line, amount: 55 }] }],
    ["a line's metric", { lineItems: [{ ...line, metric: "tokens" }] }],
    ["a line's quantity", { lineItems: [{ ...line, quantity: 11 }] }],
  ])(
    "reads an invoice charged again with %s it was not charged with as content changed",
    async (_l, change) => {
      const provider = createMockProvider();
      await provider.init({ provider: "mock" });
      await provider.chargeInvoice(charged);

      const again = await provider.chargeInvoice({ ...charged, ...change });

      expect(again).toMatchObject({ ok: false, code: "invoice_content_changed", billedAmount: 50 });
    },
  );

  it("reads an invoice charged again with its currency in another case as the same content", async () => {
    const provider = createMockProvider();
    await provider.init({ provider: "mock" });
    await provider.chargeInvoice(charged);

    const again = await provider.chargeInvoice({ ...charged, currency: "USD" });

    expect(again).toEqual({ ok: true, externalId: "mock-pi-1", collected: 0 });
  });

  it("bills usage recorded after a charge under the period's next invoice", async () => {
    const billing = await service({
      provider: "mock",
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 5 }],
    });
    const billed = period();
    billing.recordUsage("cus-1", "api_calls", 10);
    const first = billing.generateInvoice("cus-1", billed);
    await billing.chargeInvoice(first);
    billing.recordUsage("cus-1", "api_calls", 90);

    const changed = await billing.chargeInvoice(billing.generateInvoice("cus-1", billed));
    const late = await billing.chargeInvoice(
      billing.generateInvoice("cus-1", billed, { billed: [first] }),
    );
    const listed = await billing.listInvoices("cus-1");

    expect(changed).toMatchObject({ ok: false, code: "invoice_content_changed" });
    expect(late).toEqual({ ok: true, externalId: "mock-pi-2", collected: 450 });
    expect(listed.reduce((sum, invoice) => sum + invoice.totalAmount, 0)).toBe(500);
  });

  it("names invoices with the configured ID generator, handing it each sequence", async () => {
    const billing = await service({
      provider: "mock",
      pricingRules: [{ metric: "api_calls", model: "per_unit", unitPrice: 5 }],
      idGenerator: (customerId, bounds, sequence) => `${customerId}/${bounds.start}/${sequence}`,
    });
    const billed = period();
    billing.recordUsage("cus-1", "api_calls", 1);
    const first = billing.generateInvoice("cus-1", billed);
    billing.recordUsage("cus-1", "api_calls", 1);

    const late = billing.generateInvoice("cus-1", billed, { billed: [first] });

    expect(first.id).toBe(`cus-1/${billed.start}/0`);
    expect(late.id).toBe(`cus-1/${billed.start}/1`);
    expect(late.totalAmount).toBe(5);
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

    expect(withId).toMatchObject({
      ok: true,
      event: { id: "evt_given", type: "invoice.paid", payload: { id: "in_1" } },
    });
    expect(bare).toMatchObject({
      ok: true,
      event: { id: "mock-evt-2", type: "unknown", payload: { hello: "world" } },
    });
    expect(broken).toEqual({
      ok: false,
      reason: "unverified",
      error: "Invalid webhook payload: not valid JSON",
    });
  });

  it("makes no charge for a signal that has already aborted", async () => {
    const billing = await service({ provider: "mock" });
    billing.recordUsage("cus-1", "api_calls", 1);
    const invoice = billing.generateInvoice("cus-1", period());

    const stopped = await billing.chargeInvoice(invoice, { signal: AbortSignal.abort() });
    const reason = new AbortController();
    reason.abort("deadline passed");
    const stoppedWithReason = await billing.chargeInvoice(invoice, { signal: reason.signal });

    expect(stopped).toEqual({ ok: false, code: "aborted", error: "This operation was aborted" });
    expect(stoppedWithReason).toEqual({ ok: false, code: "aborted", error: "deadline passed" });
    expect(await billing.listInvoices("cus-1")).toEqual([]);
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

describe("billing service on a custom provider", () => {
  it("rejects a charge with what a provider that throws instead of reporting threw", async () => {
    registerProvider("throws-on-charge", () => ({
      ...createMockProvider(),
      name: "throws-on-charge",
      init: async () => {},
      chargeInvoice: () => Promise.reject(new Error("gateway client crashed")),
    }));
    const billing = await service({ provider: "throws-on-charge" });
    const invoice = billing.generateInvoice("cus-1", {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-02-01T00:00:00.000Z",
    });

    await expect(billing.chargeInvoice(invoice)).rejects.toThrow("gateway client crashed");
  });
});

describe("mock provider selection", () => {
  it("refuses to start when the config does not name it, as a config error", async () => {
    const starting = createMockProvider().init({});

    await expect(starting).rejects.toBeInstanceOf(ProviderConfigError);
    await expect(starting).rejects.toThrow(/runs only when named/);
  });

  it("refuses to start when the config names another provider", async () => {
    await expect(createMockProvider().init({ provider: "stripe" })).rejects.toThrow(
      /runs only when named/,
    );
  });

  it("never comes up when the config names no provider", async () => {
    // Whatever the project's default provider is, a config that names none
    // and supplies no credentials starts nothing: Stripe refuses without its
    // key, the mock refuses to be anyone's default, and any other name is not
    // registered. DEFAULT_PROVIDER is set when the project is scaffolded, so
    // the refusal expected is the one for the default this project carries.
    const refusals = new Map([
      [
        "stripe",
        "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
      ],
      [
        "mock",
        'The mock payment provider accepts any webhook signature and reports every charge as paid, so it runs only when named: pass { provider: "mock" }.',
      ],
    ]);

    await expect(createBillingService({})).rejects.toThrow(
      refusals.get(DEFAULT_PROVIDER) ??
        `Payment provider "${DEFAULT_PROVIDER}" not found. Available: stripe, mock`,
    );
  });
});

describe("billing config validation", () => {
  it.each([
    ["a currency that is not three letters", { provider: "mock", currency: "dollars" }],
    ["an empty provider name", { provider: "" }],
    ["a negative timeout", { provider: "mock", stripe: { timeoutMs: -1 } }],
    ["a timeout of zero", { provider: "mock", stripe: { timeoutMs: 0 } }],
    ["a fractional retry count", { provider: "mock", stripe: { maxNetworkRetries: 1.5 } }],
    ["a negative retry count", { provider: "mock", stripe: { maxNetworkRetries: -1 } }],
    ["more than ten retries", { provider: "mock", stripe: { maxNetworkRetries: 11 } }],
    ["a negative charge lead", { provider: "mock", stripe: { chargeLeadMs: -1 } }],
    ["a fractional charge lead", { provider: "mock", stripe: { chargeLeadMs: 0.5 } }],
    ["an ID generator that is not a function", { provider: "mock", idGenerator: "uuid" }],
    ["an HTTP client that is a string", { provider: "mock", stripe: { httpClient: "fetch" } }],
    ["an HTTP client that is null", { provider: "mock", stripe: { httpClient: null } }],
    ["an HTTP client with neither method", { provider: "mock", stripe: { httpClient: {} } }],
    ["a publishable key as the secret key", { provider: "mock", stripe: { secretKey: "pk_x" } }],
    ["an empty secret key", { provider: "mock", stripe: { secretKey: "" } }],
    [
      "a secret key with no ID after its prefix",
      { provider: "mock", stripe: { secretKey: "sk_" } },
    ],
    [
      "a secret key with a trailing newline",
      { provider: "mock", stripe: { secretKey: "sk_test_x\n" } },
    ],
  ])("rejects %s before any provider starts", async (_label, config) => {
    await expect(createBillingService(config as BillingConfig)).rejects.toThrow(
      /^Invalid billing config: /,
    );
  });

  it.each([
    ["getClientName", { makeRequest: async () => ({}) }],
    ["makeRequest", { getClientName: () => "custom" }],
  ])(
    "rejects an HTTP client with no %s, which the SDK calls on every request",
    async (_m, client) => {
      const config = { provider: "mock", stripe: { httpClient: client } };

      await expect(createBillingService(config as BillingConfig)).rejects.toThrow(
        "Invalid billing config: stripe.httpClient: httpClient must implement getClientName() and makeRequest()",
      );
    },
  );

  it("names the shape a secret key must have", async () => {
    const config = { provider: "mock", stripe: { secretKey: "pk_test_x" } };

    await expect(createBillingService(config)).rejects.toThrow(
      "Invalid billing config: stripe.secretKey: secretKey must be a Stripe secret key (sk_...) or restricted key (rk_...)",
    );
  });

  it("accepts a restricted key as the secret key", async () => {
    const billing = await service(
      stripeConfig(noNetwork().httpClient, { secretKey: "rk_test_nanohypeRestricted" }),
    );

    expect(billing.provider).toBe("stripe");
  });

  it("accepts an HTTP client that implements getClientName() and makeRequest()", async () => {
    const billing = await service(stripeConfig(noNetwork().httpClient));

    expect(billing.provider).toBe("stripe");
  });

  it("accepts each Stripe bound at its edge", async () => {
    const billing = await service(
      stripeConfig(noNetwork().httpClient, {
        timeoutMs: 1,
        maxNetworkRetries: 10,
        chargeLeadMs: 0,
      }),
    );

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
