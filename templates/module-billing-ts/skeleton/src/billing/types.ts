// ── Billing Core Types ─────────────────────────────────────────────
//
// Shared interfaces for usage records, invoices, subscriptions,
// customers, line items, and configuration. The domain shapes are
// provider-agnostic — every payment backend works against them — and
// BillingConfig carries one block per built-in provider, typed by that
// provider's module.
//

import type { StripeConfig } from "./providers/stripe-config.js";

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
   * Metric name this line item corresponds to. On an invoice a provider
   * lists, it is the metric the charge recorded on the line, and empty for a
   * line no charge of this module wrote, such as a subscription line or one
   * added by hand in the provider.
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
   * charges it under. The invoice generator derives it from the customer, the
   * billing period, and the invoice's sequence within that period. On an
   * invoice a provider lists, it is the ID the invoice was charged under, or
   * the provider's own ID for an invoice no charge of this module wrote.
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

/**
 * Derives an invoice's ID from its customer, its billing period, and its
 * sequence within that period: 0 for the period's first invoice, 1 for the
 * first invoice of usage that one did not bill, and so on.
 */
export type InvoiceIdGenerator = (
  customerId: string,
  period: BillingPeriod,
  sequence: number,
) => string;

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

  /**
   * Derives the ID of every invoice the service generates. Defaults to
   * deriveInvoiceId(). A payment provider charges an ID once, so the ID has
   * to come out the same each time the same customer, period and sequence
   * are generated, or a regenerated invoice is charged again.
   */
  idGenerator?: InvoiceIdGenerator;

  /** Stripe provider configuration. */
  stripe?: StripeConfig;

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

/** Options for one chargeInvoice call. */
export interface ChargeOptions {
  /**
   * Stops the charge before its next payment-provider call once aborted; a
   * charge the signal stopped reports `code: "aborted"`, and charging the same
   * invoice again resumes it. A call already in flight is not interrupted, so
   * the charge settles when that call does, within the provider's request
   * timeout and retry budget.
   */
  signal?: AbortSignal;

  /**
   * Charge as though this invoice ID was never charged when the provider's
   * search for an earlier charge ends at its bound without finding one, the
   * case it otherwise reports as `lookup_exhausted`. Set it only after
   * checking the payment system for an invoice carrying this ID and finding
   * none: an earlier charge past the bound is charged again. An earlier
   * charge the search does find is resumed whether this is set or not.
   */
  assumeUncharged?: boolean;
}

/** A charge that left its invoice paid. */
export interface ChargePaid {
  ok: true;

  /** The payment provider's ID for the invoice the charge paid. */
  externalId: string;

  /**
   * What this call's own payment request collected, in the smallest currency
   * unit. It is 0 when an earlier charge of the same ID had paid the invoice,
   * and 0 when the provider answered this call's payment request from an
   * earlier request with the same idempotency key: of two charges that race
   * to pay one invoice, only the one whose request made the payment reports
   * it. A payment whose answer was lost is reported by no call, because the
   * request that retries it is answered from the stored payment. Summed over
   * calls, `collected` never exceeds what was paid.
   */
  collected: number;
}

/** A charge that did not leave its invoice paid. */
export interface ChargeFailed {
  ok: false;

  /**
   * Why the invoice is not paid:
   *
   * - `declined` — the payment method was refused, such as a declined card.
   *   The invoice stays open; a provider that collects on its own retries it
   *   and reports the outcome by webhook.
   * - `payment_pending` — the payment was accepted and has not settled, as
   *   with a bank debit. Its outcome arrives by webhook.
   * - `unavailable` — the provider could not be reached or failed: a
   *   connection failure, a timeout, a 5xx, or a circuit breaker a run of
   *   those opened. Charging the invoice again resumes it.
   * - `rejected` — the provider refused the request for another reason: an
   *   invalid request, a rejected key, a rate limit, an idempotency conflict.
   *   Charging the invoice again once the cause is fixed resumes it.
   * - `aborted` — `ChargeOptions.signal` stopped the charge. Charging the
   *   invoice again resumes it.
   * - `invoice_closed` — the invoice an earlier charge of this ID left is void
   *   or uncollectible, so it takes no payment, and charging the ID again
   *   creates no other.
   * - `lookup_exhausted` — a read the provider bounds stopped at its bound,
   *   and nothing was written; `error` names the bound. Without `externalId`,
   *   the search for an earlier charge of this ID found none, so the provider
   *   cannot tell whether the ID was charged: look for an invoice carrying
   *   the ID in the payment system, and charge again with
   *   `ChargeOptions.assumeUncharged` only when there is none. With
   *   `externalId`, the search found that invoice but could not read all of
   *   its lines to compare them with this invoice's: compare the two in the
   *   payment system.
   * - `before_charge_window` — the invoice's period starts further ahead
   *   than the provider is configured to charge, and a later charge of the
   *   ID would not search back far enough to find this one. Nothing was
   *   written. Charge it once its window opens, or configure the provider's
   *   lead to cover how far ahead of a period this service bills.
   */
  code:
    | "declined"
    | "payment_pending"
    | "unavailable"
    | "rejected"
    | "aborted"
    | "invoice_closed"
    | "lookup_exhausted"
    | "before_charge_window";

  /** The provider's message, or the abort reason. */
  error: string;

  /** The provider's ID for the invoice the charge reached, when it reached one. */
  externalId?: string;
}

/**
 * An earlier charge of this invoice ID issued an invoice that bills other
 * content: another currency, or lines that differ in amount, metric or
 * quantity. The invoice ID derives from the customer, period and sequence,
 * not from what the invoice bills, so usage recorded after the first charge
 * regenerates an invoice under the same ID that bills more. The issued
 * invoice is left as it is and nothing is paid. Bill the difference with
 * `generateInvoice(customerId, period, { billed })`, which invoices the usage
 * the billed invoices leave out under the period's next sequence.
 */
export interface ChargeContentChanged {
  ok: false;

  code: "invoice_content_changed";

  /** Names the issued invoice and both totals. */
  error: string;

  /** The provider's ID for the invoice the earlier charge issued. */
  externalId: string;

  /** What that invoice bills, in the smallest currency unit: the sum of its lines. */
  billedAmount: number;
}

/** Result of charging an invoice through a payment provider. */
export type ChargeResult = ChargePaid | ChargeFailed | ChargeContentChanged;

/** Every code a charge that did not leave its invoice paid reports. */
export type ChargeFailureCode = (ChargeFailed | ChargeContentChanged)["code"];

/** A verified webhook event from the payment provider. */
export interface BillingWebhookEvent {
  /**
   * The provider's event ID. A provider can deliver an event more than once,
   * so a handler that must act once dedupes on this ID.
   */
  id: string;

  /** The provider's event type, in the provider's own names. */
  type: string;

  /**
   * The object the event describes; its shape depends on the event type. On
   * a subscription event the provider replaces the subscription's status
   * with the `Subscription["status"]` it maps to, so a status this module
   * does not recognize reads as `incomplete` and `isEntitled()` holds for it
   * only when it is `active` or `trialing`.
   */
  payload: unknown;

  /** ISO-8601 timestamp of when the provider created the event. */
  timestamp: string;
}

/** A subscription status, as `Subscription["status"]` names it. */
export type SubscriptionStatus = Subscription["status"];
