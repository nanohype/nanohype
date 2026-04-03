// ── Cost Anomaly Detection ──────────────────────────────────────────
//
// Detects anomalous cost entries using z-score analysis on a rolling
// window. An entry is flagged as an anomaly if its cost deviates
// from the rolling mean by more than `threshold` standard deviations.
//

import type { CostEntry } from "./tracker.js";

/** A detected cost anomaly. */
export interface AnomalyResult {
  /** The anomalous cost entry. */
  entry: CostEntry;
  /** The z-score (how many standard deviations from the mean). */
  zScore: number;
  /** The rolling mean at the time of this entry. */
  rollingMean: number;
  /** The rolling standard deviation at the time of this entry. */
  rollingStdDev: number;
}

/**
 * Detect anomalies in a series of cost entries using z-score analysis.
 *
 * @param entries - Cost entries in chronological order.
 * @param windowSize - Number of entries in the rolling window. Default: 20.
 * @param threshold - Z-score threshold for flagging anomalies. Default: 2.0.
 * @returns Array of detected anomalies.
 */
export function detectAnomalies(
  entries: CostEntry[],
  windowSize: number = 20,
  threshold: number = 2.0,
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  if (entries.length < windowSize) {
    return anomalies;
  }

  for (let i = windowSize; i < entries.length; i++) {
    const window = entries.slice(i - windowSize, i);
    const costs = window.map((e) => e.cost);

    const mean = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    const variance = costs.reduce((sum, c) => sum + (c - mean) ** 2, 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    // Skip if standard deviation is essentially zero (all costs identical)
    if (stdDev < 1e-10) continue;

    const entry = entries[i];
    const zScore = (entry.cost - mean) / stdDev;

    if (Math.abs(zScore) > threshold) {
      anomalies.push({
        entry,
        zScore,
        rollingMean: mean,
        rollingStdDev: stdDev,
      });
    }
  }

  return anomalies;
}
