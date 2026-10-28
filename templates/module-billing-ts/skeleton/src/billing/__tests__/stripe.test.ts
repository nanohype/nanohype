import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STRIPE_MAX_NETWORK_RETRIES, DEFAULT_STRIPE_TIMEOUT_MS } from "../config.js";
import { logger } from "../logger.js";
import { getProvider } from "../providers/registry.js";
import { createStripeProvider, isStripeOutage } from "../providers/stripe.js";
import type { PaymentProvider } from "../providers/types.js";
import type { BillingConfig, Invoice } from "../types.js";
import {
  chargedLine,
  type FakeStripeAccount,
  type FakeTransport,
  fakeStripeAccount,
  fakeStripeApi,
  hangingStripeApi,
  noNetwork,
  signedEvent,
  stripeEvent,
  stripeRefusal,
} from "./fake-stripe.js";

// ── Stripe Provider ────────────────────────────────────────────────
//
// The provider against the real Stripe SDK. Nothing replaces the `stripe`
// module: the SDK encodes every request, sends it with its idempotency key,
// times it out and retries it, and turns Stripe's answers into its own error
// classes; webhook signatures are made by `generateTestHeaderString` and
// checked by `constructEvent`. The one fake is the transport, a `fetch` that
// answers in-process (fake-stripe.ts), so no request leaves the process.
//
// The webhook assertions are pinned to Stripe's published signature
// contract: `webhooks.constructEvent(payload, header, secret)` is what
// establishes that a request came from Stripe, it takes the endpoint's
// whole signing secret, and `payload` must be the raw body bytes as
// received — a body that has been re-serialised, or merely trimmed, no
// longer matches the signature.
//

const SECRET_KEY = "sk_test_nanohypeConfigSecretKey";
const ENV_SECRET_KEY = "sk_test_nanohypeEnvSecretKey";
const WEBHOOK_SECRET = "whsec_nanohypeConfigWebhookSigningSecret";
const ENV_WEBHOOK_SECRET = "whsec_nanohypeEnvWebhookSigningSecret";
const CUSTOMER = "cus_nanohype";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", undefined);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * A provider started against `httpClient`. Retries are off, because the SDK
 * sleeps between attempts and every answer here is deterministic.
 */
async function initialized(
  httpClient: Stripe.HttpClient,
  stripe: NonNullable<BillingConfig["stripe"]> = {},
): Promise<PaymentProvider> {
  const provider = createStripeProvider();
  await provider.init({
    stripe: {
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      maxNetworkRetries: 0,
      httpClient,
      ...stripe,
    },
  });
  return provider;
}

function invoiceFixture(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-local-1",
    customerId: CUSTOMER,
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    // Tiered line items: `amount` is what the customer owes and
    // `quantity * unitPrice` is not, so a charge that recomputes the
    // total from the parts bills the wrong number.
    lineItems: [
      {
        description: "API calls",
        metric: "api_calls",
        quantity: 10,
        unitPrice: 500,
        amount: 4500,
        tier: "volume",
      },
      {
        description: "Storage",
        metric: "storage_gb",
        quantity: 2,
        unitPrice: 250,
        amount: 400,
        tier: "committed",
      },
    ],
    totalAmount: 4900,
    currency: "eur",
    status: "draft",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

const customerApi = () =>
  fakeStripeApi(() => ({ body: { id: "cus_1", object: "customer", email: null, name: null } }));

describe("stripe provider registration", () => {
  it("self-registers with the provider registry under the name stripe", () => {
    const provider = getProvider("stripe");

    expect(provider.name).toBe("stripe");
  });

  it("hands out an independent instance per call", () => {
    expect(getProvider("stripe")).not.toBe(getProvider("stripe"));
  });
});

describe("stripe provider init", () => {
  /** The credentials a request from `provider` reached Stripe with. */
  async function authorization(provider: PaymentProvider, api: FakeTransport) {
    await provider.createCustomer("a@example.com", "A");
    return api.sent.at(-1)?.headers.get("authorization");
  }

  it("authenticates with the configured secret key", async () => {
    const api = customerApi();

    const provider = await initialized(api.httpClient);

    expect(await authorization(provider, api)).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("prefers the configured secret key over the environment", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);
    const api = customerApi();

    const provider = await initialized(api.httpClient);

    expect(await authorization(provider, api)).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("falls back to STRIPE_SECRET_KEY when the stripe block omits the key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);
    const api = customerApi();
    const provider = createStripeProvider();

    await provider.init({ stripe: { httpClient: api.httpClient, maxNetworkRetries: 0 } });

    expect(await authorization(provider, api)).toBe(`Bearer ${ENV_SECRET_KEY}`);
  });

  it("starts from the environment alone when the config carries no stripe block", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ENV_WEBHOOK_SECRET);
    const provider = createStripeProvider();
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_1" }),
      ENV_WEBHOOK_SECRET,
    );

    await provider.init({});

    // Verifying a webhook sends no request, so the SDK's own transport, which
    // this config leaves in place, is never used.
    await expect(provider.handleWebhook(payload, header)).resolves.toMatchObject({
      type: "invoice.paid",
    });
  });

  it("refuses to start when no secret key is configured anywhere", async () => {
    const provider = createStripeProvider();

    await expect(provider.init({ stripe: {} })).rejects.toThrow(
      "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
    );
    await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  describe("request limits", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("abandons a request at DEFAULT_STRIPE_TIMEOUT_MS when the config names no timeout", async () => {
      const api = hangingStripeApi();
      const provider = await initialized(api.httpClient);
      let outcome: string | undefined;
      const settled = provider.createCustomer("a@example.com", "A").then(
        () => {
          outcome = "answered";
        },
        (err: Error) => {
          outcome = err.message;
        },
      );

      await vi.advanceTimersByTimeAsync(DEFAULT_STRIPE_TIMEOUT_MS - 1);
      expect(outcome).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await settled;

      expect(outcome).toBe(
        `Request aborted due to timeout being reached (${DEFAULT_STRIPE_TIMEOUT_MS}ms)`,
      );
      expect(api.sent()).toBe(1);
    });

    it("retries DEFAULT_STRIPE_MAX_NETWORK_RETRIES times when the config names no count", async () => {
      const api = fakeStripeApi(() => stripeRefusal(503, "Stripe is unavailable", "api_error"));
      const provider = createStripeProvider();
      await provider.init({ stripe: { secretKey: SECRET_KEY, httpClient: api.httpClient } });

      const outcome = provider.createCustomer("a@example.com", "A").catch((err: Error) => err);
      await vi.runAllTimersAsync();

      expect(await outcome).toMatchObject({ message: "Stripe is unavailable", statusCode: 503 });
      expect(api.sent).toHaveLength(1 + DEFAULT_STRIPE_MAX_NETWORK_RETRIES);
    });

    it("applies the configured timeout and retry count", async () => {
      const api = hangingStripeApi();
      const provider = await initialized(api.httpClient, {
        timeoutMs: 5_000,
        maxNetworkRetries: 1,
      });

      const outcome = provider.createCustomer("a@example.com", "A").catch((err: Error) => err);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(api.sent()).toBe(1);
      await vi.runAllTimersAsync();

      expect(await outcome).toMatchObject({
        message: "Request aborted due to timeout being reached (5000ms)",
      });
      expect(api.sent()).toBe(2);
    });
  });
});

describe("stripe provider createCustomer", () => {
  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("creates the customer and prefers the values Stripe echoes back", async () => {
    const api = fakeStripeApi(() => ({
      body: {
        id: "cus_fromStripe",
        object: "customer",
        email: "canonical@example.com",
        name: "Canonical Name",
      },
    }));
    const provider = await initialized(api.httpClient);

    const customer = await provider.createCustomer("typed@example.com", "Typed Name", {
      tier: "gold",
    });

    expect(api.sent.map((r) => [r.method, r.path])).toEqual([["POST", "/v1/customers"]]);
    expect(Object.fromEntries(api.sent[0]?.body ?? [])).toEqual({
      email: "typed@example.com",
      name: "Typed Name",
      "metadata[tier]": "gold",
    });
    expect(customer).toEqual({
      id: "cus_fromStripe",
      email: "canonical@example.com",
      name: "Canonical Name",
      externalId: "cus_fromStripe",
      metadata: { tier: "gold" },
    });
  });

  it("falls back to the supplied identity and an empty metadata map", async () => {
    const api = fakeStripeApi(() => ({
      body: { id: "cus_bare", object: "customer", email: null, name: null },
    }));
    const provider = await initialized(api.httpClient);

    const customer = await provider.createCustomer("typed@example.com", "Typed Name");

    expect(Object.fromEntries(api.sent[0]?.body ?? [])).toEqual({
      email: "typed@example.com",
      name: "Typed Name",
    });
    expect(customer).toEqual({
      id: "cus_bare",
      email: "typed@example.com",
      name: "Typed Name",
      externalId: "cus_bare",
      metadata: {},
    });
  });
});

describe("stripe provider circuit breaker", () => {
  it("opens after consecutive connection failures and stops calling Stripe", async () => {
    const api = fakeStripeApi(() => {
      throw new TypeError("fetch failed");
    });
    const provider = await initialized(api.httpClient);

    // The breaker this provider builds opens on the fifth consecutive
    // failure. A call routed through it is rejected from then on without
    // reaching Stripe; a call that bypasses it keeps hammering a degraded
    // Stripe on every request.
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
        /error occurred with our connection to Stripe/,
      );
    }

    await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
      /Circuit breaker is open/,
    );
    expect(api.sent).toHaveLength(5);
  });

  it("opens on 5xx answers, which say Stripe is failing", async () => {
    const api = fakeStripeApi(() => stripeRefusal(503, "Service unavailable", "api_error"));
    const provider = await initialized(api.httpClient);

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
        "Service unavailable",
      );
    }

    await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
      /Circuit breaker is open/,
    );
    expect(api.sent).toHaveLength(5);
  });

  it("stays closed through declined cards, so one customer's decline blocks no one else", async () => {
    const account = fakeStripeAccount((request, apply) =>
      request.path.endsWith("/pay")
        ? stripeRefusal(402, "Your card was declined.", "card_error")
        : apply(),
    );
    const provider = await initialized(account.httpClient);

    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await provider.chargeInvoice(invoiceFixture({ id: `inv-${attempt}` }));
      expect(result).toMatchObject({ ok: false, error: "Your card was declined." });
    }

    expect(account.sent.filter((r) => r.path.endsWith("/pay"))).toHaveLength(10);
  });

  it.each([
    [400, "invalid request"],
    [401, "invalid API key"],
    [404, "no such customer"],
    [429, "rate limited"],
  ])("stays closed through %i answers (%s)", async (status, message) => {
    const api = fakeStripeApi(() => stripeRefusal(status, message));
    const provider = await initialized(api.httpClient);

    for (let attempt = 0; attempt < 6; attempt++) {
      await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(message);
    }

    expect(api.sent).toHaveLength(6);
  });
});

describe("isStripeOutage", () => {
  /** An error shaped like the SDK's for an HTTP answer with this status. */
  function stripeError(statusCode: number, message: string): Error {
    return Object.assign(new Error(message), { statusCode, type: "StripeError" });
  }

  it.each([400, 401, 402, 403, 404, 409, 429, 499])("reads a %i answer as Stripe up", (status) => {
    expect(isStripeOutage(stripeError(status, "refused"))).toBe(false);
  });

  it.each([500, 502, 503, 504])("reads a %i answer as an outage", (status) => {
    expect(isStripeOutage(stripeError(status, "failing"))).toBe(true);
  });

  it("reads an error with no HTTP status — a connection failure or timeout — as an outage", () => {
    expect(isStripeOutage(new Error("ECONNRESET"))).toBe(true);
  });

  it("reads a status that is not a number as no status at all", () => {
    expect(isStripeOutage({ statusCode: "402" })).toBe(true);
  });

  it.each([
    ["a string", "rate_limited"],
    ["null", null],
    ["undefined", undefined],
  ])("reads %s as an outage", (_label, err) => {
    expect(isStripeOutage(err)).toBe(true);
  });
});

describe("stripe provider createSubscription", () => {
  /** A Stripe that answers every subscription create with `subscription`. */
  function subscriptionApi(subscription: object) {
    return fakeStripeApi(() => ({ body: { object: "subscription", ...subscription } }));
  }

  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.createSubscription("cus_1", "price_1")).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("maps the billing period off the subscription item", async () => {
    const api = subscriptionApi({
      id: "sub_fromStripe",
      status: "trialing",
      items: {
        object: "list",
        data: [
          { id: "si_1", current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 },
        ],
        has_more: false,
      },
    });
    const provider = await initialized(api.httpClient);

    const subscription = await provider.createSubscription("cus_1", "price_1");

    expect(api.sent.map((r) => [r.method, r.path])).toEqual([["POST", "/v1/subscriptions"]]);
    expect(Object.fromEntries(api.sent[0]?.body ?? [])).toEqual({
      customer: "cus_1",
      "items[0][price]": "price_1",
    });
    expect(subscription).toEqual({
      id: "sub_fromStripe",
      customerId: "cus_1",
      planId: "price_1",
      status: "trialing",
      currentPeriodStart: "2023-11-14T22:13:20.000Z",
      currentPeriodEnd: "2023-12-14T22:13:20.000Z",
      externalId: "sub_fromStripe",
    });
  });

  it.each([
    "active",
    "trialing",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "unpaid",
    "paused",
    "canceled",
  ])("carries the Stripe subscription status %s through unchanged", async (status) => {
    const api = subscriptionApi({
      id: `sub_${status}`,
      status,
      items: { data: [{ current_period_start: 0, current_period_end: 0 }] },
    });
    const provider = await initialized(api.httpClient);

    const subscription = await provider.createSubscription("cus_1", "price_1");

    expect(subscription.status).toBe(status);
  });

  it("maps a subscription status it does not know to incomplete, never active", async () => {
    const api = subscriptionApi({
      id: "sub_unknown",
      status: "suspended",
      items: { data: [{ current_period_start: 0, current_period_end: 0 }] },
    });
    const provider = await initialized(api.httpClient);

    const subscription = await provider.createSubscription("cus_1", "price_1");

    expect(subscription.status).toBe("incomplete");
  });

  it("throws when Stripe returns a subscription with no items", async () => {
    const api = subscriptionApi({ id: "sub_empty", status: "active", items: { data: [] } });
    const provider = await initialized(api.httpClient);

    await expect(provider.createSubscription("cus_1", "price_1")).rejects.toThrow(
      "Stripe returned a subscription with no items",
    );
  });
});

describe("stripe provider chargeInvoice", () => {
  /** The customer invoice lookup every charge starts with. */
  const LOOKUP = ["GET", "/v1/invoices", null];

  const key = (step: string) => `billing-invoice:inv-local-1:${step}`;

  /** An invoice an earlier charge of `inv-local-1` left in `account`. */
  function earlier(
    account: FakeStripeAccount,
    status: "draft" | "open" | "paid" | "void",
    lines = [chargedLine(0, 4500), chargedLine(1, 400)],
  ) {
    return account.seed({
      customer: CUSTOMER,
      currency: "eur",
      status,
      metadata: { invoice_id: "inv-local-1" },
      lines,
    });
  }

  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.chargeInvoice(invoiceFixture())).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("creates the invoice, adds every line item, finalizes it and pays it", async () => {
    const account = fakeStripeAccount();
    const provider = await initialized(account.httpClient);
    const invoice = invoiceFixture();

    // Each line item is priced away from the product of its parts, so the
    // amount Stripe is asked for can only have come from `amount` itself.
    for (const item of invoice.lineItems) {
      expect(item.amount).not.toBe(item.quantity * item.unitPrice);
    }

    const result = await provider.chargeInvoice(invoice);

    expect(result).toEqual({ ok: true, externalId: "in_1" });
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoices", key("create")],
      ["POST", "/v1/invoiceitems", key("item-0")],
      ["POST", "/v1/invoiceitems", key("item-1")],
      ["POST", "/v1/invoices/in_1/finalize", key("finalize")],
      ["POST", "/v1/invoices/in_1/pay", key("pay")],
    ]);
    const [lookup, create, apiCalls, storage, finalize] = account.sent.map((r) =>
      Object.fromEntries(r.method === "GET" ? r.query : r.body),
    );
    expect(lookup).toEqual({ customer: CUSTOMER, limit: "100" });
    expect(create).toEqual({
      customer: CUSTOMER,
      currency: "eur",
      auto_advance: "false",
      "metadata[invoice_id]": "inv-local-1",
    });
    expect(apiCalls).toEqual({
      customer: CUSTOMER,
      invoice: "in_1",
      amount: "4500",
      currency: "eur",
      description: "API calls",
      "metadata[metric]": "api_calls",
      "metadata[invoice_line]": "0",
    });
    expect(storage).toEqual({
      customer: CUSTOMER,
      invoice: "in_1",
      amount: "400",
      currency: "eur",
      description: "Storage",
      "metadata[metric]": "storage_gb",
      "metadata[invoice_line]": "1",
    });
    expect(finalize).toEqual({ auto_advance: "true" });
    expect(account.invoices).toMatchObject([
      { status: "paid", autoAdvance: true, lines: [{ amount: 4500 }, { amount: 400 }] },
    ]);
  });

  it("charges an invoice once even after Stripe has dropped its idempotency keys", async () => {
    const account = fakeStripeAccount();
    const provider = await initialized(account.httpClient);
    const first = await provider.chargeInvoice(invoiceFixture());
    account.forgetIdempotencyKeys();
    account.sent.length = 0;

    const replay = await provider.chargeInvoice(invoiceFixture());

    expect(first).toEqual({ ok: true, externalId: "in_1" });
    expect(replay).toEqual(first);
    expect(account.calls()).toEqual([LOOKUP]);
    expect(account.invoices).toHaveLength(1);
  });

  it("reports a payment whose answer was lost when the charge is retried", async () => {
    let lost = false;
    const account = fakeStripeAccount((request, apply) => {
      const answer = apply();
      if (request.path.endsWith("/pay") && !lost) {
        lost = true;
        throw new TypeError("fetch failed");
      }
      return answer;
    });
    const provider = await initialized(account.httpClient);
    const first = await provider.chargeInvoice(invoiceFixture());
    account.forgetIdempotencyKeys();
    account.sent.length = 0;

    const retry = await provider.chargeInvoice(invoiceFixture());

    expect(first).toMatchObject({ ok: false, externalId: "in_1" });
    expect(retry).toEqual({ ok: true, externalId: "in_1" });
    expect(account.calls()).toEqual([LOOKUP]);
  });

  it("finishes a draft an earlier charge left, adding only the lines it is missing", async () => {
    const account = fakeStripeAccount();
    const draft = earlier(account, "draft", [chargedLine(0, 4500)]);
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: true, externalId: draft.id });
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoiceitems", key("item-1")],
      ["POST", `/v1/invoices/${draft.id}/finalize`, key("finalize")],
      ["POST", `/v1/invoices/${draft.id}/pay`, key("pay")],
    ]);
    expect(draft.lines.map((line) => line.metadata.invoice_line)).toEqual(["0", "1"]);
    expect(draft).toMatchObject({ status: "paid", autoAdvance: true });
  });

  it("reads a draft's lines past the page embedded in it before adding any", async () => {
    const lineItems = Array.from({ length: 12 }, (_, i) => ({
      description: `line ${i}`,
      metric: "api_calls",
      quantity: 1,
      unitPrice: 100,
      amount: 100,
    }));
    const account = fakeStripeAccount();
    const draft = earlier(
      account,
      "draft",
      lineItems.slice(0, 11).map((_, i) => chargedLine(i)),
    );
    const provider = await initialized(account.httpClient);

    await provider.chargeInvoice(invoiceFixture({ lineItems, totalAmount: 1200 }));

    expect(account.calls().slice(0, 3)).toEqual([
      LOOKUP,
      ["GET", `/v1/invoices/${draft.id}/lines`, null],
      ["POST", "/v1/invoiceitems", key("item-11")],
    ]);
    expect(draft.lines).toHaveLength(12);
  });

  it("pays an open invoice an earlier charge finalized", async () => {
    const account = fakeStripeAccount();
    const open = earlier(account, "open");
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: true, externalId: open.id });
    expect(account.calls()).toEqual([LOOKUP, ["POST", `/v1/invoices/${open.id}/pay`, key("pay")]]);
  });

  it("reports an invoice an earlier charge paid without writing anything", async () => {
    const account = fakeStripeAccount();
    const paid = earlier(account, "paid");
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: true, externalId: paid.id });
    expect(account.calls()).toEqual([LOOKUP]);
  });

  it("reports a voided earlier charge as unpaid and creates no other invoice", async () => {
    const account = fakeStripeAccount();
    const voided = earlier(account, "void");
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({
      ok: false,
      externalId: voided.id,
      error: `Stripe invoice ${voided.id} is void`,
    });
    expect(account.calls()).toEqual([LOOKUP]);
  });

  it("stops reading the customer's invoices at the page holding the earlier charge", async () => {
    const account = fakeStripeAccount();
    for (let i = 0; i < 150; i++) {
      account.seed({ customer: CUSTOMER, currency: "eur", status: "paid", metadata: {} });
    }
    const paid = earlier(account, "paid");
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: true, externalId: paid.id });
    expect(account.calls()).toEqual([LOOKUP]);
  });

  it("finds an earlier charge past the first page of the customer's invoices", async () => {
    const account = fakeStripeAccount();
    const paid = earlier(account, "paid");
    for (let i = 0; i < 150; i++) {
      account.seed({
        customer: CUSTOMER,
        currency: "eur",
        status: "paid",
        metadata: i % 2 === 0 ? { invoice_id: `inv-other-${i}` } : {},
      });
    }
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: true, externalId: paid.id });
    expect(account.calls()).toEqual([LOOKUP, LOOKUP]);
    expect(account.sent[1]?.query.get("starting_after")).toBe(account.invoices[51]?.id);
  });

  it("creates an invoice when its search reaches MAX_LISTED invoices with no match", async () => {
    const warn = vi.spyOn(logger, "warn");
    let pages = 0;
    const account = fakeStripeAccount((request, apply) => {
      if (request.method !== "GET" || request.path !== "/v1/invoices") return apply();
      pages++;
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: `in_old_${pages}_${i}`,
        object: "invoice",
        metadata: { invoice_id: "inv-elsewhere" },
      }));
      return { body: { object: "list", data, has_more: true } };
    });
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(pages).toBe(10);
    expect(result).toEqual({ ok: true, externalId: "in_1" });
    expect(warn).toHaveBeenCalledWith(
      "Stripe invoice lookup stopped at its bound with no earlier charge found",
      { invoiceId: "inv-local-1", customerId: CUSTOMER, limit: 1000 },
    );
  });

  it("keys two different invoices apart", async () => {
    const account = fakeStripeAccount();
    const provider = await initialized(account.httpClient);

    await provider.chargeInvoice(invoiceFixture({ id: "inv-a" }));
    await provider.chargeInvoice(invoiceFixture({ id: "inv-b" }));

    expect(
      account.calls().filter(([method, path]) => method === "POST" && path === "/v1/invoices"),
    ).toEqual([
      ["POST", "/v1/invoices", "billing-invoice:inv-a:create"],
      ["POST", "/v1/invoices", "billing-invoice:inv-b:create"],
    ]);
    expect(account.invoices.map((i) => i.metadata.invoice_id)).toEqual(["inv-a", "inv-b"]);
  });

  it("names the Stripe invoice it created when a later step fails", async () => {
    const account = fakeStripeAccount((request, apply) =>
      request.path.endsWith("/pay")
        ? stripeRefusal(402, "Your card was declined.", "card_error")
        : apply(),
    );
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: false, externalId: "in_1", error: "Your card was declined." });
  });

  it("adds no line items for an invoice that has none", async () => {
    const account = fakeStripeAccount();
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture({ lineItems: [], totalAmount: 0 }));

    // Stripe marks an invoice that owes nothing paid when it is finalized.
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoices", key("create")],
      ["POST", "/v1/invoices/in_1/finalize", key("finalize")],
    ]);
    expect(result).toEqual({ ok: true, externalId: "in_1" });
  });

  it("returns Stripe's message when it refuses to create the invoice", async () => {
    const account = fakeStripeAccount((request, apply) =>
      request.method === "POST" && request.path === "/v1/invoices"
        ? stripeRefusal(400, "No such customer: 'cus_nanohype'")
        : apply(),
    );
    const provider = await initialized(account.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: false, error: "No such customer: 'cus_nanohype'" });
  });

  it("makes no Stripe call for a signal that has already aborted", async () => {
    const api = noNetwork();
    const provider = await initialized(api.httpClient);

    const result = await provider.chargeInvoice(invoiceFixture(), { signal: AbortSignal.abort() });

    expect(result).toEqual({ ok: false, error: "This operation was aborted" });
    expect(api.sent).toEqual([]);
  });

  it("stops before its next Stripe call once the signal aborts, and a retry resumes", async () => {
    const controller = new AbortController();
    const account = fakeStripeAccount((request, apply) => {
      const answer = apply();
      if (request.path === "/v1/invoiceitems") controller.abort();
      return answer;
    });
    const provider = await initialized(account.httpClient);

    const stopped = await provider.chargeInvoice(invoiceFixture(), { signal: controller.signal });
    const stoppedCalls = account.calls();
    account.sent.length = 0;
    const resumed = await provider.chargeInvoice(invoiceFixture());

    expect(stopped).toEqual({ ok: false, externalId: "in_1", error: "This operation was aborted" });
    expect(stoppedCalls).toEqual([
      LOOKUP,
      ["POST", "/v1/invoices", key("create")],
      ["POST", "/v1/invoiceitems", key("item-0")],
    ]);
    expect(resumed).toEqual({ ok: true, externalId: "in_1" });
    expect(account.calls()).toEqual([
      LOOKUP,
      ["POST", "/v1/invoiceitems", key("item-1")],
      ["POST", "/v1/invoices/in_1/finalize", key("finalize")],
      ["POST", "/v1/invoices/in_1/pay", key("pay")],
    ]);
    expect(account.invoices).toHaveLength(1);
  });

  it("reports an abort reason that is not an Error as it was given", async () => {
    const controller = new AbortController();
    controller.abort("deadline passed");
    const provider = await initialized(noNetwork().httpClient);

    const result = await provider.chargeInvoice(invoiceFixture(), { signal: controller.signal });

    expect(result).toEqual({ ok: false, error: "deadline passed" });
  });
});

describe("stripe provider handleWebhook", () => {
  // A body carrying the whitespace a real request carries: interior
  // whitespace that JSON.parse -> JSON.stringify drops, and a leading
  // newline and a trailing blank that a trim drops. Every byte here is
  // inside the signature.
  const RAW_PAYLOAD = [
    "",
    "{",
    '  "id": "evt_nanohypeVerified",',
    '  "object": "event",',
    '  "type": "invoice.payment_succeeded",',
    '  "created": 1700000000,',
    '  "data": { "object": { "id": "in_verified", "amount_due": 4200 } }',
    "}",
    "  ",
  ].join("\n");

  const sign = (payload: string, secret = WEBHOOK_SECRET) =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret });

  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD))).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("refuses to verify when no webhook secret is configured", async () => {
    const provider = await initialized(noNetwork().httpClient, { webhookSecret: undefined });

    await expect(provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD))).rejects.toThrow(
      "Stripe webhook secret is required. Set config.stripe.webhookSecret or STRIPE_WEBHOOK_SECRET env var.",
    );
  });

  it("returns the event Stripe signed", async () => {
    const provider = await initialized(noNetwork().httpClient);

    const event = await provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD));

    expect(event).toEqual({
      id: "evt_nanohypeVerified",
      type: "invoice.payment_succeeded",
      payload: { id: "in_verified", amount_due: 4200 },
      timestamp: "2023-11-14T22:13:20.000Z",
    });
  });

  it("verifies the bytes it received, whitespace included", async () => {
    const provider = await initialized(noNetwork().httpClient);
    const header = sign(RAW_PAYLOAD);

    await expect(provider.handleWebhook(RAW_PAYLOAD, header)).resolves.toMatchObject({
      id: "evt_nanohypeVerified",
    });
    for (const altered of [JSON.stringify(JSON.parse(RAW_PAYLOAD)), RAW_PAYLOAD.trim()]) {
      expect(altered).not.toBe(RAW_PAYLOAD);
      await expect(provider.handleWebhook(altered, header)).rejects.toThrow(
        /No signatures found matching the expected signature for payload/,
      );
    }
  });

  it("verifies with the whole signing secret", async () => {
    const provider = await initialized(noNetwork().httpClient);
    const unprefixed = WEBHOOK_SECRET.replace(/^whsec_/, "");

    await expect(
      provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD, WEBHOOK_SECRET)),
    ).resolves.toMatchObject({ id: "evt_nanohypeVerified" });
    await expect(
      provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD, unprefixed)),
    ).rejects.toThrow(/No signatures found/);
  });

  it("prefers the configured webhook secret over the environment", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ENV_WEBHOOK_SECRET);
    const provider = await initialized(noNetwork().httpClient);

    await expect(provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD))).resolves.toMatchObject({
      id: "evt_nanohypeVerified",
    });
    await expect(
      provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD, ENV_WEBHOOK_SECRET)),
    ).rejects.toThrow(/No signatures found/);
  });

  it("falls back to STRIPE_WEBHOOK_SECRET", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ENV_WEBHOOK_SECRET);
    const provider = await initialized(noNetwork().httpClient, { webhookSecret: undefined });

    await expect(
      provider.handleWebhook(RAW_PAYLOAD, sign(RAW_PAYLOAD, ENV_WEBHOOK_SECRET)),
    ).resolves.toMatchObject({ id: "evt_nanohypeVerified" });
  });

  it("propagates a verification failure instead of returning an event", async () => {
    const provider = await initialized(noNetwork().httpClient);

    await expect(provider.handleWebhook(RAW_PAYLOAD, "t=1,v1=bogus")).rejects.toThrow(
      /No signatures found matching the expected signature for payload/,
    );
  });

  /** A signed `customer.subscription.*` event whose subscription has `status`. */
  function subscriptionEvent(type: string, status: string) {
    return signedEvent(
      stripeEvent(
        type,
        { id: "sub_1", object: "subscription", customer: "cus_1", status },
        `evt_${status}`,
      ),
      WEBHOOK_SECRET,
    );
  }

  it.each([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
  ])("normalises the subscription status on %s", async (type) => {
    const provider = await initialized(noNetwork().httpClient);
    const { payload, header } = subscriptionEvent(type, "suspended");

    const event = await provider.handleWebhook(payload, header);

    expect(event.payload).toEqual({
      id: "sub_1",
      object: "subscription",
      customer: "cus_1",
      status: "incomplete",
    });
  });

  it.each([
    "active",
    "trialing",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "unpaid",
    "paused",
    "canceled",
  ])("carries a %s subscription status through a webhook unchanged", async (status) => {
    const provider = await initialized(noNetwork().httpClient);
    const { payload, header } = subscriptionEvent("customer.subscription.updated", status);

    const event = await provider.handleWebhook(payload, header);

    expect((event.payload as { status: string }).status).toBe(status);
  });

  it("reads an inherited property name as an unknown status, not a known one", async () => {
    const provider = await initialized(noNetwork().httpClient);
    const { payload, header } = subscriptionEvent("customer.subscription.updated", "constructor");

    const event = await provider.handleWebhook(payload, header);

    expect((event.payload as { status: string }).status).toBe("incomplete");
  });

  it("leaves the status on an object that is not a subscription alone", async () => {
    const provider = await initialized(noNetwork().httpClient);
    const { payload, header } = signedEvent(
      stripeEvent(
        "invoice.payment_failed",
        { id: "in_1", object: "invoice", status: "open" },
        "evt_invoice",
      ),
      WEBHOOK_SECRET,
    );

    const event = await provider.handleWebhook(payload, header);

    expect(event).toEqual({
      id: "evt_invoice",
      type: "invoice.payment_failed",
      payload: { id: "in_1", object: "invoice", status: "open" },
      timestamp: "2023-11-14T22:13:20.000Z",
    });
  });
});

describe("stripe provider listInvoices", () => {
  /** A Stripe answering invoice lists from `invoices` and line lists from `lines`. */
  function invoicesApi(
    invoices: (query: URLSearchParams) => { data: object[]; has_more?: boolean },
    lines: (query: URLSearchParams) => { data: object[]; has_more?: boolean } = () => ({
      data: [],
    }),
  ) {
    return fakeStripeApi((request) => {
      const list = request.path === "/v1/invoices" ? invoices : lines;
      const { data, has_more = false } = list(request.query);
      return { body: { object: "list", data, has_more } };
    });
  }

  function invoiceStub(id: string, lines: object = { data: [], has_more: false }) {
    return {
      id,
      object: "invoice",
      period_start: 0,
      period_end: 0,
      lines,
      total: 0,
      currency: "usd",
      status: "paid",
      created: 0,
      metadata: {},
    };
  }

  /** `count` invoice stubs named from `start`. */
  function invoiceRun(start: number, count: number) {
    return Array.from({ length: count }, (_, i) => invoiceStub(`in_${start + i}`));
  }

  function lineRun(start: number, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `il_${start + i}`,
      object: "line_item",
      description: `line ${start + i}`,
      quantity: 1,
      amount: 1,
      pricing: null,
      metadata: { metric: "api_calls" },
    }));
  }

  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.listInvoices("cus_1")).rejects.toThrow("Stripe provider not initialized");
  });

  it("maps a fully populated invoice page", async () => {
    const api = invoicesApi(() => ({
      data: [
        {
          id: "in_full",
          object: "invoice",
          period_start: 1_700_000_000,
          period_end: 1_702_592_000,
          lines: {
            object: "list",
            data: [
              {
                id: "il_1",
                description: "API calls",
                quantity: 10,
                amount: 5000,
                pricing: { unit_amount_decimal: "500.0000000000" },
                metadata: { metric: "api_calls" },
              },
              {
                id: "il_2",
                description: "Fractional unit price",
                quantity: 1,
                amount: 1235,
                pricing: { unit_amount_decimal: "1234.5600000000" },
                metadata: {},
              },
              { id: "il_3", description: null, quantity: null, amount: 0, metadata: {} },
            ],
            has_more: false,
          },
          total: 6235,
          currency: "eur",
          status: "paid",
          created: 1_700_000_050,
          metadata: {},
        },
      ],
    }));
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(api.sent.map((r) => `${r.method} ${r.path}?${r.query}`)).toEqual([
      "GET /v1/invoices?customer=cus_1&limit=100",
    ]);
    expect(invoices).toEqual([
      {
        id: "in_full",
        customerId: "cus_1",
        periodStart: "2023-11-14T22:13:20.000Z",
        periodEnd: "2023-12-14T22:13:20.000Z",
        lineItems: [
          {
            description: "API calls",
            metric: "api_calls",
            quantity: 10,
            unitPrice: 500,
            amount: 5000,
          },
          {
            description: "Fractional unit price",
            metric: "",
            quantity: 1,
            unitPrice: 1235,
            amount: 1235,
          },
          { description: "", metric: "", quantity: 0, unitPrice: 0, amount: 0 },
        ],
        totalAmount: 6235,
        currency: "eur",
        status: "paid",
        createdAt: "2023-11-14T22:14:10.000Z",
        externalId: "in_full",
      },
    ]);
  });

  it("lists an invoice it charged under the ID it was charged under", async () => {
    const charged = { ...invoiceStub("in_charged"), metadata: { invoice_id: "inv-local-1" } };
    const api = invoicesApi(() => ({ data: [charged, invoiceStub("in_elsewhere")] }));
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices.map((i) => [i.id, i.externalId])).toEqual([
      ["inv-local-1", "in_charged"],
      ["in_elsewhere", "in_elsewhere"],
    ]);
  });

  it("defaults every absent field on a sparse invoice", async () => {
    const api = invoicesApi(() => ({
      data: [
        {
          id: "in_sparse",
          object: "invoice",
          period_start: null,
          period_end: null,
          total: 0,
          currency: null,
          status: null,
          created: 1_700_000_000,
          metadata: null,
        },
      ],
    }));
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices).toEqual([
      {
        id: "in_sparse",
        customerId: "cus_1",
        periodStart: "1970-01-01T00:00:00.000Z",
        periodEnd: "1970-01-01T00:00:00.000Z",
        lineItems: [],
        totalAmount: 0,
        currency: "usd",
        status: "draft",
        createdAt: "2023-11-14T22:13:20.000Z",
        externalId: "in_sparse",
      },
    ]);
  });

  it("falls back to draft for an invoice status it does not map", async () => {
    const api = invoicesApi(() => ({
      data: [{ ...invoiceStub("in_unknown"), status: "deleted" }],
    }));
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices[0]?.status).toBe("draft");
  });

  it("follows the cursor past the first page", async () => {
    const api = invoicesApi((query) =>
      query.has("starting_after")
        ? { data: invoiceRun(100, 40), has_more: false }
        : { data: invoiceRun(0, 100), has_more: true },
    );
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices).toHaveLength(140);
    expect(invoices.at(-1)?.id).toBe("in_139");
    expect(api.sent.map((r) => `${r.query}`)).toEqual([
      "customer=cus_1&limit=100",
      "customer=cus_1&limit=100&starting_after=in_99",
    ]);
  });

  it("stops at the listing bound when more invoices remain", async () => {
    let next = 0;
    const api = invoicesApi(() => {
      const page = invoiceRun(next, 100);
      next += 100;
      return { data: page, has_more: true };
    });
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices).toHaveLength(1000);
    expect(api.sent).toHaveLength(10);
  });

  it("reads a list that ends exactly at the bound in full", async () => {
    let next = 0;
    const api = invoicesApi(() => {
      const page = invoiceRun(next, 100);
      next += 100;
      return { data: page, has_more: next < 1000 };
    });
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices).toHaveLength(1000);
    expect(invoices.at(-1)?.id).toBe("in_999");
  });

  it("stops on a page that claims more but carries nothing to cursor from", async () => {
    const api = invoicesApi(() => ({ data: [], has_more: true }));
    const provider = await initialized(api.httpClient);

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices).toEqual([]);
    expect(api.sent).toHaveLength(1);
  });

  it("reads every line of an invoice, not only the page embedded in it", async () => {
    const api = invoicesApi(
      () => ({ data: [invoiceStub("in_long", { data: lineRun(0, 10), has_more: true })] }),
      () => ({ data: lineRun(10, 25) }),
    );
    const provider = await initialized(api.httpClient);

    const [invoice] = await provider.listInvoices("cus_1");

    expect(invoice?.lineItems).toHaveLength(35);
    expect(invoice?.lineItems.at(-1)).toEqual({
      description: "line 34",
      metric: "api_calls",
      quantity: 1,
      unitPrice: 0,
      amount: 1,
    });
    expect(api.sent.map((r) => `${r.path}?${r.query}`)).toEqual([
      "/v1/invoices?customer=cus_1&limit=100",
      "/v1/invoices/in_long/lines?limit=100&starting_after=il_9",
    ]);
  });

  it("stops reading an invoice's lines at the bound", async () => {
    let next = 10;
    const api = invoicesApi(
      () => ({ data: [invoiceStub("in_huge", { data: lineRun(0, 10), has_more: true })] }),
      () => {
        const page = lineRun(next, 100);
        next += 100;
        // The page that crosses the bound is the last one Stripe has, so the
        // overshoot alone is what marks the listing as cut short.
        return { data: page, has_more: next < 1010 };
      },
    );
    const provider = await initialized(api.httpClient);

    const [invoice] = await provider.listInvoices("cus_1");

    expect(invoice?.lineItems).toHaveLength(1000);
    expect(invoice?.lineItems.at(-1)?.description).toBe("line 999");
    expect(api.sent.filter((r) => r.path.endsWith("/lines"))).toHaveLength(10);
  });
});

describe("stripe provider close", () => {
  it("releases the client and the webhook secret", async () => {
    const api = noNetwork();
    const provider = await initialized(api.httpClient);
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_1" }),
      WEBHOOK_SECRET,
    );

    await provider.close();

    await expect(provider.handleWebhook(payload, header)).rejects.toThrow(
      "Stripe provider not initialized",
    );
    await expect(provider.listInvoices("cus_1")).rejects.toThrow("Stripe provider not initialized");
    expect(api.sent).toEqual([]);
  });

  it("leaves no signing secret behind when shutdown overtakes startup", async () => {
    const provider = createStripeProvider();
    const { payload, header } = signedEvent(
      stripeEvent("invoice.paid", { id: "in_1" }),
      WEBHOOK_SECRET,
    );

    // init() reads the secrets, then suspends on the SDK import before it
    // installs the client. close() runs to completion inside that window,
    // so the client lands after the shutdown that was meant to release it
    // and handleWebhook reads whatever close() left. A secret still held
    // here would verify — and accept — this correctly signed request.
    const starting = provider.init({
      stripe: {
        secretKey: SECRET_KEY,
        webhookSecret: WEBHOOK_SECRET,
        httpClient: noNetwork().httpClient,
      },
    });
    await provider.close();
    await starting;

    await expect(provider.handleWebhook(payload, header)).rejects.toThrow(
      /Stripe webhook secret is required/,
    );
  });
});
