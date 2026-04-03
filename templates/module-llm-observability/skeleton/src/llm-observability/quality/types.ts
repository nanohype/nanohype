// ── Quality Types ──────────────────────────────────────────────────

// Re-export QualityScore from shared types
export type { QualityScore } from "../types.js";

/** Window configuration for quality statistics. */
export interface QualityWindow {
  /** Number of most recent scores to include. Default: 100. */
  windowSize?: number;
}

/** Aggregated quality statistics over a sliding window. */
export interface QualityStats {
  /** Number of scores in the window. */
  count: number;
  /** Mean score. */
  avg: number;
  /** Median score (50th percentile). */
  p50: number;
  /** 95th percentile score. */
  p95: number;
  /** Trend: positive = improving, negative = regressing. */
  trend: number;
}
