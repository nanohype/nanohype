// ── Billing Core Types ─────────────────────────────────────────────
//
// Shared interfaces for usage records, invoices, subscriptions,
// customers, line items, and configuration. The domain shapes are
// provider-agnostic — every payment backend works against them — and
// BillingConfig carries one block per built-in provider.
//

/** A recorded usage event for a customer. */
export interface UsageRecord {
  /** Unique identifier for this usage record. */
  id: string;

  /** Customer this usage belongs to. */
  customerId: string;

  /** Metric name (e.g., "api_calls", "tokens_used", "storage_gb"). */
  metric: string;

  /** Quantity consumed. */
  quantity: number;

  /** ISO-8601 timestamp of when the usage occurred. */
  timestamp: string;

  /** Arbitrary key-value tags for filtering and grouping. */
  tags: Record<string, string>;
}

/** A line item on an invoice. */
export interface LineItem {
  /** Description of the charge (e.g., "API calls — 10,000 units"). */
  description: string;

  /**
   * Metric name this line item corresponds to. On an invoice listed from
   * Stripe it is read from the `metric` metadata the Stripe provider writes
   * on every invoice item it creates, and is empty for a line it did not
   * create — a subscription line, or an item added in the Dashboard.
   */
  metric: string;

  /** Total quantity for this line item. */
  quantity: number;

  /** Price per unit in the smallest currency unit (e.g., cents). */
  unitPrice: number;

  /** Total amount in the smallest currency unit. */
  amount: number;

  /** Pricing tier applied, if tiered pricing was used. */
  tier?: string;
}

/** An invoice for a customer covering a billing period. */
export interface Invoice {
  /**
   * Unique identifier for this invoice, and the key a payment provider
   * charges it under. The invoice generator derives it from the customer and
   * billing period. On an invoice listed from Stripe it is the ID the invoice
   * was charged under, read from the `invoice_id` metadata the Stripe
   * provider writes, or the Stripe invoice ID for an invoice it did not
   * create.
   */
  id: string;

  /** Customer this invoice belongs to. */
  customerId: string;

  /** ISO-8601 start of the billing period. */
  periodStart: string;

  /** ISO-8601 end of the billing period. */
  periodEnd: string;

  /** Individual charges that make up this invoice. */
  lineItems: LineItem[];

  /** Total amount in the smallest currency unit (e.g., cents). */
  totalAmount: number;

  /** Three-letter currency code (e.g., "usd"). */
  currency: string;

  /** Current invoice status. */
  status: "draft" | "open" | "paid" | "void" | "uncollectible";

  /** ISO-8601 timestamp of when the invoice was generated. */
  createdAt: string;

  /** External provider invoice ID, if synced. */
  externalId?: string;
}

/** A customer record. */
export interface Customer {
  /** Internal customer identifier. */
  id: string;

  /** Customer email address. */
  email: string;

  /** Customer display name. */
  name: string;

  /** External provider customer ID (e.g., Stripe cus_xxx). */
  externalId?: string;

  /** Arbitrary metadata. */
  metadata: Record<string, string>;
}

/** A subscription linking a customer to a plan. */
export interface Subscription {
  /** Unique subscription identifier. */
  id: string;

  /** Customer this subscription belongs to. */
  customerId: string;

  /** Plan or price identifier. */
  planId: string;

  /**
   * Current subscription status. Only `active` and `trialing` entitle the
   * customer to the plan — test it with `isEntitled()`. Every other status
   * means payment has not cleared (`incomplete`, `past_due`, `unpaid`), the
   * first payment never cleared (`incomplete_expired`), or the subscription
   * is stopped (`paused`, `canceled`). A status the provider reports that
   * this union does not name reads as `incomplete`, so a state this module
   * cannot interpret never grants access.
   */
  status:
    | "active"
    | "trialing"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "unpaid"
    | "paused"
    | "canceled";

  /** ISO-8601 timestamp of the current period start. */
  currentPeriodStart: string;

  /** ISO-8601 timestamp of the current period end. */
  currentPeriodEnd: string;

  /** External provider subscription ID, if synced. */
  externalId?: string;
}

/** A billing period for aggregation. */
export interface BillingPeriod {
  /** ISO-8601 start of the billing period. */
  start: string;

  /** ISO-8601 end of the billing period. */
  end: string;
}

/** Pricing rule for a metric. */
export interface PricingRule {
  /** Metric name this rule applies to. */
  metric: string;

  /** Pricing model. */
  model: "per_unit" | "tiered" | "flat";

  /** Price per unit (for per_unit model), in smallest currency unit. */
  unitPrice?: number;

  /** Flat fee amount (for flat model), in smallest currency unit. */
  flatAmount?: number;

  /** Pricing tiers (for tiered model). */
  tiers?: PricingTier[];
}

/** A single tier in tiered pricing. */
export interface PricingTier {
  /** Upper bound of this tier (inclusive). Use Infinity for the last tier. */
  upTo: number;

  /** Price per unit within this tier, in smallest currency unit. */
  unitPrice: number;

  /** Optional label for this tier. */
  label?: string;
}

/** Configuration for creating a billing service. */
export interface BillingConfig {
  /**
   * Payment provider name. When omitted, `DEFAULT_PROVIDER` from config.ts —
   * the provider the project was scaffolded with. The mock provider runs only
   * when it is named here.
   */
  provider?: string;

  /** Currency code (default: "usd"). */
  currency?: string;

  /** Pricing rules keyed by metric name. */
  pricingRules?: PricingRule[];

  /** Stripe-specific configuration. */
  stripe?: {
    /** Secret API key. Falls back to the STRIPE_SECRET_KEY env var. */
    secretKey?: string;

    /** Webhook endpoint signing secret. Falls back to STRIPE_WEBHOOK_SECRET. */
    webhookSecret?: string;

    /**
     * Milliseconds before a single Stripe request is abandoned. Defaults to
     * DEFAULT_STRIPE_TIMEOUT_MS.
     */
    timeoutMs?: number;

    /**
     * Retries the SDK makes, with exponential backoff, after a connection
     * error, a 409, a 5xx, or an answer carrying `Stripe-Should-Retry: true`,
     * and never after one carrying `Stripe-Should-Retry: false`. Defaults to
     * DEFAULT_STRIPE_MAX_NETWORK_RETRIES. The SDK also retries a connection
     * closed on the first attempt once, even when this is 0. Every write
     * chargeInvoice makes carries an idempotency key, so a retried write is
     * applied once.
     */
    maxNetworkRetries?: number;

    /**
     * HTTP client the SDK sends requests through. Defaults to the SDK's Node
     * client; pass `Stripe.createFetchHttpClient()` on a runtime without
     * `node:http`, or a client backed by a fake `fetch` in tests.
     */
    httpClient?: StripeHttpClient;
  };

  /** Provider-specific configuration. */
  [key: string]: unknown;
}

/**
 * A transport the Stripe SDK sends requests through: the two methods the SDK
 * calls on a custom HTTP client, `getClientName` for its user agent and
 * `makeRequest` for every request. `Stripe.createFetchHttpClient()` and
 * `Stripe.createNodeHttpClient()` return one.
 */
export interface StripeHttpClient {
  getClientName(): string;
  makeRequest(...args: never[]): Promise<unknown>;
}

/** Aggregated usage summary for a customer and period. */
export interface UsageSummary {
  /** Customer this summary belongs to. */
  customerId: string;

  /** The billing period covered. */
  period: BillingPeriod;

  /** Total quantity by metric name. */
  totalByMetric: Record<string, number>;

  /** Computed line items with pricing applied. */
  lineItems: LineItem[];
}

/** Options for one chargeInvoice call. */
export interface ChargeOptions {
  /**
   * Stops the charge before its next payment-provider call once aborted, so
   * `AbortSignal.timeout(ms)` bounds a whole charge rather than each request.
   * A request already in flight runs to its own timeout. A stopped charge
   * reports `ok: false`, and charging the same invoice again resumes it.
   */
  signal?: AbortSignal;
}

/** Result of charging an invoice through a payment provider. */
export interface ChargeResult {
  /** Whether the charge succeeded. */
  ok: boolean;

  /** External transaction or payment intent ID. */
  externalId?: string;

  /** Error message if the charge failed. */
  error?: string;
}

/** A verified webhook event from the payment provider. */
export interface BillingWebhookEvent {
  /**
   * The provider's event ID (Stripe `evt_...`). Stripe delivers an event at
   * least once, so a handler that must act once dedupes on this ID.
   */
  id: string;

  /**
   * The provider's event type — for Stripe, `invoice.paid`,
   * `invoice.payment_failed`, `customer.subscription.created`,
   * `customer.subscription.updated`, `customer.subscription.deleted`, and the
   * rest of Stripe's event catalog.
   */
  type: string;

  /**
   * The object the event describes; its shape depends on the event type. On
   * a Stripe `customer.subscription.*` event it is the Stripe subscription
   * with `status` normalised to `Subscription["status"]`, so a status this
   * module does not recognise reads as `incomplete` and `isEntitled()` holds
   * for it only when it is `active` or `trialing`.
   */
  payload: unknown;

  /** ISO-8601 timestamp of when the provider created the event. */
  timestamp: string;
}

/** A subscription status, as `Subscription["status"]` names it. */
export type SubscriptionStatus = Subscription["status"];
