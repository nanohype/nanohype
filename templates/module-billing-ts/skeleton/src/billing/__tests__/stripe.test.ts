import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { getProvider } from "../providers/registry.js";
import { createStripeProvider } from "../providers/stripe.js";
import type { BillingConfig, Invoice } from "../types.js";

// ── Stripe Provider ────────────────────────────────────────────────
//
// The `stripe` package is replaced wholesale — no network, no SDK, no
// key. The stand-in constructor records the secret key it was handed
// and adopts the per-test stub client, so every assertion here is about
// what the provider hands the SDK rather than what Stripe does with it.
//
// The webhook assertions are pinned to Stripe's published signature
// contract: `webhooks.constructEvent(payload, header, secret)` is what
// establishes that a request came from Stripe, it takes the endpoint's
// whole signing secret, and `payload` must be the raw body bytes as
// received — a body that has been re-serialised, or merely trimmed, no
// longer matches the signature.
//

const stripeSdk = vi.hoisted(() => {
  const constructedWith: string[] = [];
  const state: { client: object } = { client: {} };

  class StripeStub {
    constructor(secretKey: string) {
      constructedWith.push(secretKey);
      Object.assign(this, state.client);
    }
  }

  return { StripeStub, constructedWith, state };
});

vi.mock("stripe", () => ({ default: stripeSdk.StripeStub }));

const SECRET_KEY = "sk_test_nanohypeConfigSecretKey";
const ENV_SECRET_KEY = "sk_test_nanohypeEnvSecretKey";
const WEBHOOK_SECRET = "whsec_nanohypeConfigWebhookSigningSecret";
const ENV_WEBHOOK_SECRET = "whsec_nanohypeEnvWebhookSigningSecret";
const SIGNATURE_HEADER =
  "t=1700000000,v1=1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809";

// A body carrying the whitespace a real request carries: interior
// whitespace that JSON.parse -> JSON.stringify drops, and a leading
// newline and a trailing blank that a trim drops. Its contents disagree
// with the event the SDK returns, so a handler that parses the request
// instead of verifying it is visible too. Every byte here is inside the
// signature.
const RAW_PAYLOAD = [
  "",
  "{",
  '  "id": "evt_unverified_decoy",',
  '  "type": "decoy.unverified",',
  '  "created": 1,',
  '  "data": { "object": { "id": "obj_decoy" } }',
  "}",
  "  ",
].join("\n");

const VERIFIED_EVENT = {
  id: "evt_nanohypeVerified",
  type: "invoice.payment_succeeded",
  created: 1_700_000_000,
  data: { object: { id: "in_verified", amount_due: 4200 } },
};

interface StubClient {
  customers: { create: Mock };
  subscriptions: { create: Mock };
  invoices: { create: Mock; finalizeInvoice: Mock; pay: Mock; list: Mock };
  invoiceItems: { create: Mock };
  webhooks: { constructEvent: Mock };
}

function stubClient(): StubClient {
  return {
    customers: { create: vi.fn() },
    subscriptions: { create: vi.fn() },
    invoices: { create: vi.fn(), finalizeInvoice: vi.fn(), pay: vi.fn(), list: vi.fn() },
    invoiceItems: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  };
}

let client: StubClient;

beforeEach(() => {
  client = stubClient();
  stripeSdk.state.client = client;
  stripeSdk.constructedWith.length = 0;
  vi.stubEnv("STRIPE_SECRET_KEY", undefined);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const FULL_CONFIG: BillingConfig = {
  stripe: { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET },
};

async function initialized(config: BillingConfig = FULL_CONFIG) {
  const provider = createStripeProvider();
  await provider.init(config);
  return provider;
}

function invoiceFixture(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-local-1",
    customerId: "cus_nanohype",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    // A tiered line item: `amount` is what the customer owes and
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
    ],
    totalAmount: 4500,
    currency: "usd",
    status: "open",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

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
  it("constructs the SDK client with the configured secret key", async () => {
    await initialized();

    expect(stripeSdk.constructedWith).toEqual([SECRET_KEY]);
  });

  it("prefers the configured secret key over the environment", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);

    await initialized();

    expect(stripeSdk.constructedWith).toEqual([SECRET_KEY]);
  });

  it("falls back to STRIPE_SECRET_KEY when the config carries no stripe block", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);

    await initialized({});

    expect(stripeSdk.constructedWith).toEqual([ENV_SECRET_KEY]);
  });

  it("falls back to STRIPE_SECRET_KEY when the stripe block omits the key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", ENV_SECRET_KEY);

    await initialized({ stripe: { webhookSecret: WEBHOOK_SECRET } });

    expect(stripeSdk.constructedWith).toEqual([ENV_SECRET_KEY]);
  });

  it("refuses to start when no secret key is configured anywhere", async () => {
    const provider = createStripeProvider();

    await expect(provider.init({ stripe: {} })).rejects.toThrow(/Stripe secret key is required/);
    expect(stripeSdk.constructedWith).toEqual([]);
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
    client.customers.create.mockResolvedValue({
      id: "cus_fromStripe",
      email: "canonical@example.com",
      name: "Canonical Name",
    });
    const provider = await initialized();

    const customer = await provider.createCustomer("typed@example.com", "Typed Name", {
      tier: "gold",
    });

    expect(client.customers.create).toHaveBeenCalledWith({
      email: "typed@example.com",
      name: "Typed Name",
      metadata: { tier: "gold" },
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
    client.customers.create.mockResolvedValue({ id: "cus_bare", email: null, name: null });
    const provider = await initialized();

    const customer = await provider.createCustomer("typed@example.com", "Typed Name");

    expect(client.customers.create).toHaveBeenCalledWith({
      email: "typed@example.com",
      name: "Typed Name",
      metadata: undefined,
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
  it("opens the breaker on the customer path and stops calling Stripe", async () => {
    client.customers.create.mockRejectedValue(new Error("stripe_unavailable"));
    const provider = await initialized();

    // The breaker this provider builds opens on the fifth consecutive
    // failure. A call routed through it is rejected from then on without
    // reaching the SDK; a call that goes straight to `customers.create`
    // keeps hammering a degraded Stripe on every request.
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
        "stripe_unavailable",
      );
    }

    await expect(provider.createCustomer("a@example.com", "A")).rejects.toThrow(
      /Circuit breaker is open/,
    );
    expect(client.customers.create).toHaveBeenCalledTimes(5);
  });
});

describe("stripe provider createSubscription", () => {
  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.createSubscription("cus_1", "price_1")).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("maps the billing period off the subscription item", async () => {
    client.subscriptions.create.mockResolvedValue({
      id: "sub_fromStripe",
      status: "trialing",
      items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] },
    });
    const provider = await initialized();

    const subscription = await provider.createSubscription("cus_1", "price_1");

    expect(client.subscriptions.create).toHaveBeenCalledWith({
      customer: "cus_1",
      items: [{ price: "price_1" }],
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

  it("falls back to active for a subscription status it does not map", async () => {
    client.subscriptions.create.mockResolvedValue({
      id: "sub_incomplete",
      status: "incomplete_expired",
      items: { data: [{ current_period_start: 0, current_period_end: 0 }] },
    });
    const provider = await initialized();

    const subscription = await provider.createSubscription("cus_1", "price_1");

    expect(subscription.status).toBe("active");
  });

  it("throws when Stripe returns a subscription with no items", async () => {
    client.subscriptions.create.mockResolvedValue({
      id: "sub_empty",
      status: "active",
      items: { data: [] },
    });
    const provider = await initialized();

    await expect(provider.createSubscription("cus_1", "price_1")).rejects.toThrow(
      "Stripe returned a subscription with no items",
    );
  });
});

describe("stripe provider chargeInvoice", () => {
  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.chargeInvoice(invoiceFixture())).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("creates the invoice, adds every line item, finalizes it and pays it", async () => {
    client.invoices.create.mockResolvedValue({ id: "in_created" });
    client.invoiceItems.create.mockResolvedValue({ id: "ii_1" });
    client.invoices.finalizeInvoice.mockResolvedValue({ id: "in_created", status: "open" });
    client.invoices.pay.mockResolvedValue({ id: "in_created", status: "paid" });
    const provider = await initialized();

    const invoice = invoiceFixture({
      currency: "eur",
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
    });

    // Each line item is priced away from the product of its parts, so the
    // amount Stripe is asked for can only have come from `amount` itself.
    for (const item of invoice.lineItems) {
      expect(item.amount).not.toBe(item.quantity * item.unitPrice);
    }

    const result = await provider.chargeInvoice(invoice);

    expect(client.invoices.create).toHaveBeenCalledWith({
      customer: "cus_nanohype",
      auto_advance: true,
    });
    expect(client.invoiceItems.create).toHaveBeenCalledTimes(2);
    expect(client.invoiceItems.create).toHaveBeenNthCalledWith(1, {
      customer: "cus_nanohype",
      invoice: "in_created",
      amount: 4500,
      currency: "eur",
      description: "API calls",
    });
    expect(client.invoiceItems.create).toHaveBeenNthCalledWith(2, {
      customer: "cus_nanohype",
      invoice: "in_created",
      amount: 400,
      currency: "eur",
      description: "Storage",
    });
    expect(client.invoices.finalizeInvoice).toHaveBeenCalledWith("in_created");
    expect(client.invoices.pay).toHaveBeenCalledWith("in_created");
    expect(result).toEqual({ ok: true, externalId: "in_created" });
  });

  it("adds no line items for an invoice that has none", async () => {
    client.invoices.create.mockResolvedValue({ id: "in_empty" });
    client.invoices.finalizeInvoice.mockResolvedValue({ id: "in_empty", status: "paid" });
    const provider = await initialized();

    const result = await provider.chargeInvoice(invoiceFixture({ lineItems: [] }));

    expect(client.invoiceItems.create).not.toHaveBeenCalled();
    expect(client.invoices.pay).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, externalId: "in_empty" });
  });

  it("reports a failed charge when finalization leaves the invoice unpaid", async () => {
    client.invoices.create.mockResolvedValue({ id: "in_draft" });
    client.invoiceItems.create.mockResolvedValue({ id: "ii_1" });
    client.invoices.finalizeInvoice.mockResolvedValue({ id: "in_draft", status: "draft" });
    const provider = await initialized();

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(client.invoices.pay).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, externalId: "in_draft" });
  });

  it("returns the message when the SDK rejects with an Error", async () => {
    client.invoices.create.mockRejectedValue(new Error("card_declined"));
    const provider = await initialized();

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: false, error: "card_declined" });
  });

  it("stringifies a rejection that is not an Error", async () => {
    client.invoices.create.mockRejectedValue("rate_limited");
    const provider = await initialized();

    const result = await provider.chargeInvoice(invoiceFixture());

    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("stripe provider handleWebhook", () => {
  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER)).rejects.toThrow(
      "Stripe provider not initialized",
    );
  });

  it("refuses to verify when no webhook secret is configured", async () => {
    const provider = await initialized({ stripe: { secretKey: SECRET_KEY } });

    await expect(provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER)).rejects.toThrow(
      /Stripe webhook secret is required/,
    );
    expect(client.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("returns the event the SDK verified, never the unverified request body", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    const event = await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    expect(client.webhooks.constructEvent).toHaveBeenCalledTimes(1);
    expect(event).toEqual({
      type: "invoice.payment_succeeded",
      payload: { id: "in_verified", amount_due: 4200 },
      timestamp: "2023-11-14T22:13:20.000Z",
    });
    expect(event.type).not.toBe("decoy.unverified");
    expect(event.payload).not.toEqual({ id: "obj_decoy" });
  });

  it("verifies the bytes it received, not a re-serialised body", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    const verified = client.webhooks.constructEvent.mock.calls[0]?.[0];
    expect(verified).toBe(RAW_PAYLOAD);
    expect(verified).not.toBe(JSON.stringify(JSON.parse(RAW_PAYLOAD)));
  });

  it("verifies the surrounding whitespace too, not a trimmed body", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    const verified = client.webhooks.constructEvent.mock.calls[0]?.[0];
    expect(RAW_PAYLOAD).not.toBe(RAW_PAYLOAD.trim());
    expect(verified).toBe(RAW_PAYLOAD);
    expect(verified).not.toBe(RAW_PAYLOAD.trim());
  });

  it("passes the signature header through and the signing secret whole", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    expect(client.webhooks.constructEvent).toHaveBeenCalledWith(
      RAW_PAYLOAD,
      SIGNATURE_HEADER,
      WEBHOOK_SECRET,
    );
  });

  it("prefers the configured webhook secret over the environment", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ENV_WEBHOOK_SECRET);
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    expect(client.webhooks.constructEvent.mock.calls[0]?.[2]).toBe(WEBHOOK_SECRET);
  });

  it("falls back to STRIPE_WEBHOOK_SECRET", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", ENV_WEBHOOK_SECRET);
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized({ stripe: { secretKey: SECRET_KEY } });

    await provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER);

    expect(client.webhooks.constructEvent.mock.calls[0]?.[2]).toBe(ENV_WEBHOOK_SECRET);
  });

  it("propagates a verification failure instead of returning an event", async () => {
    client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const provider = await initialized();

    await expect(provider.handleWebhook(RAW_PAYLOAD, "t=1,v1=bogus")).rejects.toThrow(
      /No signatures found/,
    );
  });
});

describe("stripe provider listInvoices", () => {
  it("refuses to run before init", async () => {
    const provider = createStripeProvider();

    await expect(provider.listInvoices("cus_1")).rejects.toThrow("Stripe provider not initialized");
  });

  it("maps a fully populated invoice page", async () => {
    client.invoices.list.mockResolvedValue({
      data: [
        {
          id: "in_full",
          period_start: 1_700_000_000,
          period_end: 1_702_592_000,
          lines: {
            data: [
              {
                description: "API calls",
                quantity: 10,
                amount: 5000,
                pricing: { unit_amount_decimal: "500.0000000000" },
              },
              {
                description: "Fractional unit price",
                quantity: 1,
                amount: 1235,
                pricing: { unit_amount_decimal: "1234.5600000000" },
              },
              { description: null, quantity: null, amount: 0, pricing: undefined },
            ],
          },
          total: 6235,
          currency: "eur",
          status: "paid",
          created: 1_700_000_050,
        },
      ],
    });
    const provider = await initialized();

    const invoices = await provider.listInvoices("cus_1");

    expect(client.invoices.list).toHaveBeenCalledWith({ customer: "cus_1", limit: 100 });
    expect(invoices).toEqual([
      {
        id: "in_full",
        customerId: "cus_1",
        periodStart: "2023-11-14T22:13:20.000Z",
        periodEnd: "2023-12-14T22:13:20.000Z",
        lineItems: [
          {
            description: "API calls",
            metric: "",
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

  it("defaults every absent field on a sparse invoice", async () => {
    client.invoices.list.mockResolvedValue({
      data: [
        {
          id: "in_sparse",
          period_start: null,
          period_end: null,
          lines: undefined,
          total: 0,
          currency: null,
          status: null,
          created: 1_700_000_000,
        },
      ],
    });
    const provider = await initialized();

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
    client.invoices.list.mockResolvedValue({
      data: [
        {
          id: "in_unknown",
          period_start: 0,
          period_end: 0,
          lines: { data: [] },
          total: 0,
          currency: "usd",
          status: "deleted",
          created: 0,
        },
      ],
    });
    const provider = await initialized();

    const invoices = await provider.listInvoices("cus_1");

    expect(invoices[0]?.status).toBe("draft");
  });
});

describe("stripe provider close", () => {
  it("releases the client and the webhook secret", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = await initialized();

    await provider.close();

    await expect(provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER)).rejects.toThrow(
      "Stripe provider not initialized",
    );
    await expect(provider.listInvoices("cus_1")).rejects.toThrow("Stripe provider not initialized");
    expect(client.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("leaves no signing secret behind when shutdown overtakes startup", async () => {
    client.webhooks.constructEvent.mockReturnValue(VERIFIED_EVENT);
    const provider = createStripeProvider();

    // init() reads the secrets, then suspends on the SDK import before it
    // installs the client. close() runs to completion inside that window,
    // so the client lands after the shutdown that was meant to release it
    // and handleWebhook reads whatever close() left. A secret still held
    // here would verify — and accept — this request.
    const starting = provider.init(FULL_CONFIG);
    await provider.close();
    await starting;

    await expect(provider.handleWebhook(RAW_PAYLOAD, SIGNATURE_HEADER)).rejects.toThrow(
      /Stripe webhook secret is required/,
    );
    expect(client.webhooks.constructEvent).not.toHaveBeenCalled();
  });
});
