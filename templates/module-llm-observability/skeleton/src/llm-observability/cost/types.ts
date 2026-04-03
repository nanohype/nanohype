// ── Cost Types ─────────────────────────────────────────────────────

// Re-export CostEntry from the shared types for convenience
export type { CostEntry } from "../types.js";

/** Filters for querying cost entries. */
export interface CostFilters {
  /** Filter by provider name. */
  provider?: string;
  /** Filter by model name. */
  model?: string;
  /** Filter by tag key-value pairs (all must match). */
  tags?: Record<string, string>;
  /** Start of time range (ISO-8601). */
  since?: string;
  /** End of time range (ISO-8601). */
  until?: string;
}

/** Aggregated cost query result. */
export interface CostSummary {
  /** Total cost in USD across all matching entries. */
  totalCost: number;
  /** Total number of matching entries. */
  totalRequests: number;
  /** Cost breakdown by model. */
  byModel: Record<string, number>;
  /** Cost breakdown by provider. */
  byProvider: Record<string, number>;
  /** The matching entries. */
  entries: CostEntry[];
}
