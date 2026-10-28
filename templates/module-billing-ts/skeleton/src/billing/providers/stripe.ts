import type Stripe from "stripe";
import { DEFAULT_STRIPE_MAX_NETWORK_RETRIES, DEFAULT_STRIPE_TIMEOUT_MS } from "../config.js";
import { logger } from "../logger.js";
import { CircuitBreaker } from "../resilience/circuit-breaker.js";
import type {
  BillingConfig,
  BillingWebhookEvent,
  ChargeResult,
  Customer,
  Invoice,
  Subscription,
} from "../types.js";
import { registerProvider } from "./registry.js";
import type { PaymentProvider } from "./types.js";

// ── Stripe Payment Provider ────────────────────────────────────────
//
// Factory that creates a Stripe-backed PaymentProvider. All mutable
// state (SDK client, webhook secret, circuit breaker) lives inside
// the factory closure — no module-level singletons.
//
// Key design decisions:
//   - Lazy client initialization — Stripe SDK only loaded when init()
//     is called, so the module can be imported without side effects
//   - Explicit request timeout and network retries, set from config
//   - Circuit breaker on all API calls, opened only by outages — a 4xx
//     is Stripe answering, and never counts against it
//   - Every write chargeInvoice makes carries an idempotency key derived
//     from the caller's invoice ID, so a retried charge replays instead
//     of creating and paying a second invoice
//   - Webhook verification via stripe.webhooks.constructEvent()
//

/** Upper bound on the invoices listInvoices reads, and on the lines per invoice. */
const MAX_LISTED = 1000;

/** The largest page Stripe's list endpoints return. */
const PAGE_SIZE = 100;

/** Invoice-item metadata key that carries a line's metric name. */
const METRIC_METADATA_KEY = "metric";

interface ListPage<T> {
  data: T[];
  has_more: boolean;
}

/**
 * True when a failed Stripe call is evidence that Stripe is unavailable: a
 * connection failure or timeout, which carries no HTTP status, or a 5xx. A 4xx
 * — a declined card, an invalid request, a rejected key, a rate limit — is
 * Stripe answering. Counting it would let five declined cards open the breaker
 * and block every customer's billing for the reset window.
 */
export function isStripeOutage(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null | undefined)?.statusCode;
  return !(typeof status === "number" && status >= 400 && status < 500);
}

/**
 * Read a Stripe list to its end or to MAX_LISTED items, whichever comes first,
 * cursoring with `starting_after` on the last item's ID. `first` is a page
 * already in hand, such as the lines embedded in an invoice.
 */
async function collectPages<T extends { id?: string }>(
  fetchPage: (startingAfter: string | undefined) => Promise<ListPage<T>>,
  first?: ListPage<T>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = first ?? (await fetchPage(undefined));

  for (;;) {
    items.push(...page.data);
    if (items.length >= MAX_LISTED) {
      return {
        items: items.slice(0, MAX_LISTED),
        truncated: page.has_more || items.length > MAX_LISTED,
      };
    }

    const cursor = page.data.at(-1)?.id;
    if (!page.has_more || cursor === undefined) return { items, truncated: false };
    page = await fetchPage(cursor);
  }
}

function createStripeProvider(): PaymentProvider {
  let client: Stripe | null = null;
  let webhookSecret: string | null = null;

  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30_000,
    halfOpenMaxAttempts: 2,
    isFailure: isStripeOutage,
  });

  async function withBreaker<T>(fn: () => Promise<T>): Promise<T> {
    return breaker.execute(fn);
  }

  function requireClient(): Stripe {
    if (!client) throw new Error("Stripe provider not initialized");
    return client;
  }

  /**
   * Every line of an invoice: the page embedded in it, then the rest. Paging
   * starts from the embedded page, so every page fetched here has a cursor.
   */
  async function invoiceLines(
    stripe: Stripe,
    invoice: Stripe.Invoice,
  ): Promise<Stripe.InvoiceLineItem[]> {
    const { items, truncated } = await collectPages(
      (startingAfter) =>
        withBreaker(() =>
          stripe.invoices.listLineItems(invoice.id, {
            limit: PAGE_SIZE,
            starting_after: startingAfter,
          }),
        ),
      invoice.lines ?? { data: [], has_more: false },
    );
    if (truncated) {
      logger.warn("Stripe invoice lines truncated", { externalId: invoice.id, limit: MAX_LISTED });
    }
    return items;
  }

  return {
    name: "stripe",

    async init(config: BillingConfig): Promise<void> {
      const secretKey = config.stripe?.secretKey ?? process.env.STRIPE_SECRET_KEY;

      if (!secretKey) {
        throw new Error(
          "Stripe secret key is required. Set config.stripe.secretKey or STRIPE_SECRET_KEY env var.",
        );
      }

      webhookSecret = config.stripe?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;

      // Lazy load the Stripe SDK
      //
      // No `apiVersion` is passed. `Stripe.LatestApiVersion` is `typeof
      // ApiVersion` — the single version string the installed SDK was generated
      // against — and the constructor option is typed as exactly that, so the
      // only value that compiles is the one the client already falls back to.
      // Writing it out cannot change which `Stripe-Version` is sent; it can only
      // stop compiling on the next SDK release, on a tree nobody edited.
      const { default: StripeSdk } = await import("stripe");
      client = new StripeSdk(secretKey, {
        timeout: config.stripe?.timeoutMs ?? DEFAULT_STRIPE_TIMEOUT_MS,
        maxNetworkRetries: config.stripe?.maxNetworkRetries ?? DEFAULT_STRIPE_MAX_NETWORK_RETRIES,
        httpClient: config.stripe?.httpClient,
      });

      logger.info("Stripe provider initialized");
    },

    async createCustomer(
      email: string,
      name: string,
      metadata?: Record<string, string>,
    ): Promise<Customer> {
      const stripe = requireClient();

      const stripeCustomer = await withBreaker(() =>
        stripe.customers.create({ email, name, metadata }),
      );

      logger.info("Stripe customer created", { externalId: stripeCustomer.id });

      return {
        id: stripeCustomer.id,
        email: stripeCustomer.email ?? email,
        name: stripeCustomer.name ?? name,
        externalId: stripeCustomer.id,
        metadata: metadata ?? {},
      };
    },

    async createSubscription(customerId: string, planId: string): Promise<Subscription> {
      const stripe = requireClient();

      const stripeSub = await withBreaker(() =>
        stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: planId }],
        }),
      );

      logger.info("Stripe subscription created", { externalId: stripeSub.id });

      const period = stripeSub.items.data[0];
      if (!period) throw new Error("Stripe returned a subscription with no items");

      return {
        id: stripeSub.id,
        customerId,
        planId,
        status: mapStripeSubStatus(stripeSub.status),
        // A subscription's billing period lives on its items, because a
        // subscription with staggered items has more than one. A single-price
        // subscription — what this provider creates — has exactly one item,
        // so its period is the subscription's.
        currentPeriodStart: new Date(period.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(period.current_period_end * 1000).toISOString(),
        externalId: stripeSub.id,
      };
    },

    async chargeInvoice(invoice: Invoice): Promise<ChargeResult> {
      const stripe = requireClient();

      // Each write is keyed by the caller's invoice ID and its step, so
      // charging the same invoice again — after a timeout, a crash, or a lost
      // response — replays every step Stripe already applied instead of
      // creating a second invoice and paying it. Stripe holds a key for 24
      // hours and replays the stored response, failures included: a declined
      // payment stays declined for this invoice ID. Collecting it after that
      // is Stripe's automatic collection on the open invoice (`auto_advance`),
      // which reports through `invoice.paid` and `invoice.payment_failed`.
      const key = (step: string) => `billing-invoice:${invoice.id}:${step}`;
      let externalId: string | undefined;

      try {
        const stripeInvoice = await withBreaker(async () => {
          const created = await stripe.invoices.create(
            {
              customer: invoice.customerId,
              currency: invoice.currency,
              auto_advance: true,
              metadata: { invoice_id: invoice.id },
            },
            { idempotencyKey: key("create") },
          );
          externalId = created.id;

          for (const [index, item] of invoice.lineItems.entries()) {
            await stripe.invoiceItems.create(
              {
                customer: invoice.customerId,
                invoice: created.id,
                amount: item.amount,
                currency: invoice.currency,
                description: item.description,
                metadata: { [METRIC_METADATA_KEY]: item.metric },
              },
              { idempotencyKey: key(`item-${index}`) },
            );
          }

          const finalized = await stripe.invoices.finalizeInvoice(
            created.id,
            {},
            { idempotencyKey: key("finalize") },
          );
          if (finalized.status === "open") {
            return stripe.invoices.pay(created.id, {}, { idempotencyKey: key("pay") });
          }
          return finalized;
        });

        logger.info("Stripe invoice charged", { invoiceId: invoice.id, externalId });

        return {
          ok: stripeInvoice.status === "paid",
          externalId: stripeInvoice.id,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Stripe charge failed", { invoiceId: invoice.id, externalId, error: message });
        return { ok: false, externalId, error: message };
      }
    },

    async handleWebhook(payload: string, signature: string): Promise<BillingWebhookEvent> {
      const stripe = requireClient();

      if (!webhookSecret) {
        throw new Error(
          "Stripe webhook secret is required. Set config.stripe.webhookSecret or STRIPE_WEBHOOK_SECRET env var.",
        );
      }

      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      logger.info("Stripe webhook verified", { type: event.type, id: event.id });

      return {
        id: event.id,
        type: event.type,
        payload: webhookPayload(event),
        timestamp: new Date(event.created * 1000).toISOString(),
      };
    },

    async listInvoices(customerId: string): Promise<Invoice[]> {
      const stripe = requireClient();

      const { items, truncated } = await collectPages((startingAfter) =>
        withBreaker(() =>
          stripe.invoices.list({
            customer: customerId,
            limit: PAGE_SIZE,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          }),
        ),
      );
      if (truncated) {
        logger.warn("Stripe invoice listing truncated", { customerId, limit: MAX_LISTED });
      }

      const invoices: Invoice[] = [];
      for (const inv of items) {
        const lines = await invoiceLines(stripe, inv);
        invoices.push({
          id: inv.id,
          customerId,
          periodStart: new Date((inv.period_start ?? 0) * 1000).toISOString(),
          periodEnd: new Date((inv.period_end ?? 0) * 1000).toISOString(),
          lineItems: lines.map((line) => ({
            description: line.description ?? "",
            metric: line.metadata?.[METRIC_METADATA_KEY] ?? "",
            quantity: line.quantity ?? 0,
            // pricing.unit_amount_decimal is a decimal string with up to 12
            // places; LineItem.unitPrice holds an integer minor-unit amount.
            unitPrice: Math.round(Number(line.pricing?.unit_amount_decimal ?? 0)),
            amount: line.amount,
          })),
          totalAmount: inv.total,
          currency: inv.currency ?? "usd",
          status: mapStripeInvoiceStatus(inv.status),
          createdAt: new Date(inv.created * 1000).toISOString(),
          externalId: inv.id,
        });
      }
      return invoices;
    },

    async close(): Promise<void> {
      client = null;
      webhookSecret = null;
      logger.info("Stripe provider closed");
    },
  };
}

/**
 * The object a verified event describes. On a `customer.subscription.*` event
 * the subscription's raw Stripe status is replaced by the mapped one, so a
 * handler reads the same statuses createSubscription returns and a status this
 * module does not recognise cannot read as entitled.
 */
function webhookPayload(event: Stripe.Event): unknown {
  const object = event.data.object;
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = object as Stripe.Subscription;
    return { ...subscription, status: mapStripeSubStatus(subscription.status) };
  }
  return object;
}

const SUBSCRIPTION_STATUSES = {
  active: true,
  trialing: true,
  incomplete: true,
  incomplete_expired: true,
  past_due: true,
  unpaid: true,
  paused: true,
  canceled: true,
} satisfies Record<Subscription["status"], true>;

// A status this table does not know maps to `incomplete`, never `active`:
// a subscription whose state cannot be read grants no access to the plan.
function mapStripeSubStatus(status: Stripe.Subscription.Status): Subscription["status"] {
  if (Object.hasOwn(SUBSCRIPTION_STATUSES, status)) return status as Subscription["status"];
  logger.warn("Unrecognised Stripe subscription status read as incomplete", { status });
  return "incomplete";
}

const INVOICE_STATUSES = {
  draft: true,
  open: true,
  paid: true,
  void: true,
  uncollectible: true,
} satisfies Record<Invoice["status"], true>;

function mapStripeInvoiceStatus(status: Stripe.Invoice.Status | null): Invoice["status"] {
  if (status !== null && Object.hasOwn(INVOICE_STATUSES, status)) {
    return status as Invoice["status"];
  }
  return "draft";
}

// Self-register factory
registerProvider("stripe", createStripeProvider);

export { createStripeProvider };
