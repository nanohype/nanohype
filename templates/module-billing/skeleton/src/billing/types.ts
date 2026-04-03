// ── Billing Core Types ─────────────────────────────────────────────
//
// Shared interfaces for usage records, invoices, subscriptions,
// customers, line items, and configuration. These are provider-agnostic
// — every payment backend works against the same shapes.
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

  /** Metric name this line item corresponds to. */
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
  /** Unique identifier for this invoice. */
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

  /** Current subscription status. */
  status: "active" | "canceled" | "past_due" | "trialing" | "paused";

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
  /** Default payment provider name. */
  provider?: string;

  /** Currency code (default: "usd"). */
  currency?: string;

  /** Pricing rules keyed by metric name. */
  pricingRules?: PricingRule[];

  /** Stripe-specific configuration. */
  stripe?: {
    secretKey?: string;
    webhookSecret?: string;
  };

  /** Provider-specific configuration. */
  [key: string]: unknown;
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

/** Result of charging an invoice through a payment provider. */
export interface ChargeResult {
  /** Whether the charge succeeded. */
  ok: boolean;

  /** External transaction or payment intent ID. */
  externalId?: string;

  /** Error message if the charge failed. */
  error?: string;
}

/** Webhook event emitted by billing lifecycle. */
export interface BillingWebhookEvent {
  /** Event type (e.g., "subscription.created", "invoice.paid", "payment_failed"). */
  type: string;

  /** Event payload — shape depends on the event type. */
  payload: unknown;

  /** ISO-8601 timestamp. */
  timestamp: string;
}
