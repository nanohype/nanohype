// ── Metering Types ─────────────────────────────────────────────────
//
// Interfaces specific to the usage metering subsystem.
//

import type { BillingPeriod, UsageRecord, UsageSummary, PricingRule } from "../types.js";

/** Options for recording a usage event. */
export interface RecordOptions {
  /** Customer identifier. */
  customerId: string;

  /** Metric name (e.g., "api_calls", "tokens_used"). */
  metric: string;

  /** Quantity consumed. Must be a positive number. */
  quantity: number;

  /** Optional key-value tags for filtering and grouping. */
  tags?: Record<string, string>;
}

/** Configuration for the usage tracker. */
export interface UsageTrackerConfig {
  /** Optional custom ID generator. Defaults to crypto.randomUUID(). */
  idGenerator?: () => string;
}

/** A usage tracker that records and retrieves usage events. */
export interface UsageTracker {
  /** Record a usage event. Returns the stored UsageRecord. */
  record(opts: RecordOptions): UsageRecord;

  /** Retrieve all usage records for a customer within a period. */
  getRecords(customerId: string, period: BillingPeriod): UsageRecord[];

  /** Retrieve all usage records for a customer, optionally filtered by tags. */
  getRecordsByTags(
    customerId: string,
    tags: Record<string, string>,
  ): UsageRecord[];

  /** Clear all stored records. */
  clear(): void;
}

/** Configuration for the usage aggregator. */
export interface UsageAggregatorConfig {
  /** Pricing rules to apply during aggregation. */
  pricingRules?: PricingRule[];

  /** Currency code (default: "usd"). */
  currency?: string;
}

/** A usage aggregator that computes summaries from raw records. */
export interface UsageAggregator {
  /** Aggregate usage for a customer over a period, applying pricing rules. */
  aggregate(
    records: UsageRecord[],
    customerId: string,
    period: BillingPeriod,
  ): UsageSummary;
}
