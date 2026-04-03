import type { PaymentProvider } from "./types.js";
import type {
  BillingConfig,
  Customer,
  Subscription,
  Invoice,
  ChargeResult,
  BillingWebhookEvent,
} from "../types.js";
import { CircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";
import { registerProvider } from "./registry.js";

// ── Stripe Payment Provider ────────────────────────────────────────
//
// Wraps the Stripe SDK for customer management, subscriptions, invoice
// creation, payment processing, and webhook signature verification.
//
// Key design decisions:
//   - Lazy client initialization — Stripe SDK only loaded when init()
//     is called, so the module can be imported without side effects
//   - Circuit breaker on all API calls — prevents cascade failures
//     when Stripe is degraded
//   - Webhook verification via stripe.webhooks.constructEvent()
//

// Lazy import types — actual Stripe class loaded in init()
type StripeClient = import("stripe").default;

let client: StripeClient | null = null;
let webhookSecret: string | null = null;

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30_000,
  halfOpenMaxAttempts: 2,
});

async function withBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return breaker.execute(fn);
}

const stripeProvider: PaymentProvider = {
  name: "stripe",

  async init(config: BillingConfig): Promise<void> {
    const secretKey =
      config.stripe?.secretKey ?? process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error(
        "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
      );
    }

    webhookSecret =
      config.stripe?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;

    // Lazy load the Stripe SDK
    const { default: Stripe } = await import("stripe");
    client = new Stripe(secretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    logger.info("Stripe provider initialized");
  },

  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
  ): Promise<Customer> {
    if (!client) throw new Error("Stripe provider not initialized");

    const stripeCustomer = await withBreaker(() =>
      client!.customers.create({ email, name, metadata }),
    );

    logger.info("Stripe customer created", { externalId: stripeCustomer.id });

    return {
      id: stripeCustomer.id,
      email: stripeCustomer.email ?? email,
      name: stripeCustomer.name ?? name,
      externalId: stripeCustomer.id,
      metadata: (metadata ?? {}) as Record<string, string>,
    };
  },

  async createSubscription(
    customerId: string,
    planId: string,
  ): Promise<Subscription> {
    if (!client) throw new Error("Stripe provider not initialized");

    const stripeSub = await withBreaker(() =>
      client!.subscriptions.create({
        customer: customerId,
        items: [{ price: planId }],
      }),
    );

    logger.info("Stripe subscription created", { externalId: stripeSub.id });

    return {
      id: stripeSub.id,
      customerId,
      planId,
      status: mapStripeSubStatus(stripeSub.status),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toISOString(),
      externalId: stripeSub.id,
    };
  },

  async chargeInvoice(invoice: Invoice): Promise<ChargeResult> {
    if (!client) throw new Error("Stripe provider not initialized");

    try {
      const stripeInvoice = await withBreaker(async () => {
        const inv = await client!.invoices.create({
          customer: invoice.customerId,
          auto_advance: true,
        });

        // Add line items
        for (const item of invoice.lineItems) {
          await client!.invoiceItems.create({
            customer: invoice.customerId,
            invoice: inv.id,
            amount: item.amount,
            currency: invoice.currency,
            description: item.description,
          });
        }

        // Finalize and pay
        const finalized = await client!.invoices.finalizeInvoice(inv.id);
        if (finalized.status === "open") {
          return client!.invoices.pay(inv.id);
        }
        return finalized;
      });

      logger.info("Stripe invoice charged", { externalId: stripeInvoice.id });

      return {
        ok: stripeInvoice.status === "paid",
        externalId: stripeInvoice.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Stripe charge failed", { error: message });
      return { ok: false, error: message };
    }
  },

  async handleWebhook(
    payload: string,
    signature: string,
  ): Promise<BillingWebhookEvent> {
    if (!client) throw new Error("Stripe provider not initialized");

    if (!webhookSecret) {
      throw new Error(
        "Stripe webhook secret is required. Set config.stripe.webhookSecret or STRIPE_WEBHOOK_SECRET env var.",
      );
    }

    const event = client.webhooks.constructEvent(payload, signature, webhookSecret);

    logger.info("Stripe webhook verified", { type: event.type, id: event.id });

    return {
      type: event.type,
      payload: event.data.object,
      timestamp: new Date(event.created * 1000).toISOString(),
    };
  },

  async listInvoices(customerId: string): Promise<Invoice[]> {
    if (!client) throw new Error("Stripe provider not initialized");

    const result = await withBreaker(() =>
      client!.invoices.list({ customer: customerId, limit: 100 }),
    );

    return result.data.map((inv) => ({
      id: inv.id,
      customerId,
      periodStart: new Date((inv.period_start ?? 0) * 1000).toISOString(),
      periodEnd: new Date((inv.period_end ?? 0) * 1000).toISOString(),
      lineItems: (inv.lines?.data ?? []).map((line) => ({
        description: line.description ?? "",
        metric: "",
        quantity: line.quantity ?? 0,
        unitPrice: line.unit_amount ?? 0,
        amount: line.amount,
      })),
      totalAmount: inv.total,
      currency: inv.currency ?? "usd",
      status: mapStripeInvoiceStatus(inv.status),
      createdAt: new Date(inv.created * 1000).toISOString(),
      externalId: inv.id,
    }));
  },

  async close(): Promise<void> {
    client = null;
    webhookSecret = null;
    logger.info("Stripe provider closed");
  },
};

function mapStripeSubStatus(
  status: string,
): Subscription["status"] {
  const mapping: Record<string, Subscription["status"]> = {
    active: "active",
    canceled: "canceled",
    past_due: "past_due",
    trialing: "trialing",
    paused: "paused",
  };
  return mapping[status] ?? "active";
}

function mapStripeInvoiceStatus(
  status: string | null,
): Invoice["status"] {
  const mapping: Record<string, Invoice["status"]> = {
    draft: "draft",
    open: "open",
    paid: "paid",
    void: "void",
    uncollectible: "uncollectible",
  };
  return mapping[status ?? "draft"] ?? "draft";
}

// Self-register
registerProvider(stripeProvider);
