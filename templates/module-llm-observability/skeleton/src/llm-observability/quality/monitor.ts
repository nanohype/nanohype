// ── Quality Monitor ─────────────────────────────────────────────────
//
// Tracks quality scores for LLM responses using a sliding window.
// Computes aggregate statistics (avg, p50, p95) and detects quality
// regression via trend analysis. All state is instance-scoped.
//

import type { QualityScore } from "../types.js";
import type { QualityWindow, QualityStats } from "./types.js";

export type { QualityWindow, QualityStats } from "./types.js";

/**
 * Create a quality monitor instance. Records scores and computes
 * sliding-window statistics with trend detection.
 */
export function createQualityMonitor() {
  const scores: QualityScore[] = [];

  /**
   * Record a quality score for a request.
   *
   * @param requestId - Identifier for the request being scored.
   * @param score - Quality score between 0.0 and 1.0.
   */
  function record(requestId: string, score: number): QualityScore {
    const entry: QualityScore = {
      requestId,
      score: Math.max(0, Math.min(1, score)),
      recordedAt: new Date().toISOString(),
    };
    scores.push(entry);
    return entry;
  }

  /**
   * Get quality statistics over a sliding window of recent scores.
   *
   * The trend is computed by comparing the average of the first half
   * of the window to the average of the second half. A positive trend
   * means quality is improving; negative means regressing.
   */
  function getStats(window: QualityWindow = {}): QualityStats {
    const windowSize = window.windowSize ?? 100;
    const windowed = scores.slice(-windowSize);

    if (windowed.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, trend: 0 };
    }

    const values = windowed.map((s) => s.score);
    const sorted = [...values].sort((a, b) => a - b);

    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const trend = computeTrend(values);

    return { count: windowed.length, avg, p50, p95, trend };
  }

  /**
   * Get all recorded scores (unwindowed).
   */
  function getScores(): QualityScore[] {
    return [...scores];
  }

  return { record, getStats, getScores };
}

/**
 * Compute the value at a given percentile from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

/**
 * Compute trend by comparing average of first half to second half.
 * Returns a value between -1 and 1 where positive = improving.
 */
function computeTrend(values: number[]): number {
  if (values.length < 4) return 0;

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;

  return secondAvg - firstAvg;
}

export type QualityMonitor = ReturnType<typeof createQualityMonitor>;
