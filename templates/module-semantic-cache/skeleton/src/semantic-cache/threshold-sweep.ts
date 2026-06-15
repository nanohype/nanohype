// ── Similarity-threshold sweep ──────────────────────────────────────
//
// The cache serves a stored response when a query's cosine similarity to it is
// at or above `similarityThreshold` (default 0.95). Too low and you serve
// answers to *different* questions (false hits — the expensive kind of wrong);
// too high and you miss genuine paraphrases. The right value is data-dependent,
// not a constant.
//
// This sweep finds it empirically. Given a labeled validation set — pairs of
// (query, best cached candidate) with a ground-truth "same intent?" flag — it
// reports hit / false-hit / miss rates at each candidate threshold and
// recommends the lowest threshold whose false-hit rate stays under a tolerance
// (so you capture the most paraphrases without serving wrong answers).

import { cosineSimilarity } from "./similarity.js";

/** A query matched against its best cached candidate, with the ground truth. */
export interface SweepSample {
  /** Cosine similarity (0–1) of the query to its nearest cached entry. */
  similarity: number;
  /** Whether the cached entry actually answers the same intent. */
  sameIntent: boolean;
}

/** Embedding-pair form of a sample, for when you have vectors rather than scores. */
export interface SweepEmbeddingSample {
  queryEmbedding: number[];
  candidateEmbedding: number[];
  sameIntent: boolean;
}

export interface ThresholdResult {
  threshold: number;
  /** Queries served from cache (similarity ≥ threshold). */
  served: number;
  /** Served and correct (same intent). */
  trueHits: number;
  /** Served but wrong (different intent) — the costly error. */
  falseHits: number;
  /** Not served (similarity < threshold). */
  misses: number;
  /** served / total. */
  hitRate: number;
  /** falseHits / total. */
  falseHitRate: number;
  /** misses / total. */
  missRate: number;
  /** trueHits / served (1 when nothing is served). */
  precision: number;
}

export interface SweepReport {
  results: ThresholdResult[];
  /** Recommended threshold: lowest with falseHitRate ≤ maxFalseHitRate. */
  recommended: number;
  reason: string;
}

export interface SweepOptions {
  /** Thresholds to evaluate. Default [0.85, 0.88, 0.90, 0.92, 0.95, 0.98]. */
  thresholds?: number[];
  /** Acceptable false-hit rate for the recommendation. Default 0.01. */
  maxFalseHitRate?: number;
}

const DEFAULT_THRESHOLDS = [0.85, 0.88, 0.9, 0.92, 0.95, 0.98];

/** sweepThresholds evaluates each candidate threshold over the validation set. */
export function sweepThresholds(samples: SweepSample[], options: SweepOptions = {}): SweepReport {
  const thresholds = [...(options.thresholds ?? DEFAULT_THRESHOLDS)].sort((a, b) => a - b);
  const maxFalseHitRate = options.maxFalseHitRate ?? 0.01;
  const total = samples.length;

  const results: ThresholdResult[] = thresholds.map((threshold) => {
    let served = 0;
    let trueHits = 0;
    let falseHits = 0;
    for (const s of samples) {
      if (s.similarity >= threshold) {
        served++;
        if (s.sameIntent) trueHits++;
        else falseHits++;
      }
    }
    const misses = total - served;
    return {
      threshold,
      served,
      trueHits,
      falseHits,
      misses,
      hitRate: total > 0 ? served / total : 0,
      falseHitRate: total > 0 ? falseHits / total : 0,
      missRate: total > 0 ? misses / total : 0,
      precision: served > 0 ? trueHits / served : 1,
    };
  });

  // Lowest threshold (most hits) whose false-hit rate is still acceptable.
  const acceptable = results.filter((r) => r.falseHitRate <= maxFalseHitRate);
  let recommended: number;
  let reason: string;
  if (total === 0) {
    recommended = thresholds[thresholds.length - 1];
    reason = "No validation samples — defaulting to the most conservative threshold.";
  } else if (acceptable.length > 0) {
    const best = acceptable[0]; // results are threshold-ascending
    recommended = best.threshold;
    reason = `Lowest threshold with false-hit rate ≤ ${maxFalseHitRate}: serves ${(best.hitRate * 100).toFixed(1)}% of queries at ${(best.falseHitRate * 100).toFixed(2)}% false hits (precision ${(best.precision * 100).toFixed(1)}%).`;
  } else {
    recommended = thresholds[thresholds.length - 1];
    reason = `No threshold keeps false hits ≤ ${maxFalseHitRate}; recommending the strictest (${recommended}). Your validation set may have near-duplicate different-intent queries — consider a better embedder.`;
  }

  return { results, recommended, reason };
}

/** sweepEmbeddings is sweepThresholds for when you have raw embedding pairs. */
export function sweepEmbeddings(
  samples: SweepEmbeddingSample[],
  options: SweepOptions = {},
): SweepReport {
  return sweepThresholds(
    samples.map((s) => ({
      similarity: cosineSimilarity(s.queryEmbedding, s.candidateEmbedding),
      sameIntent: s.sameIntent,
    })),
    options,
  );
}

/** renderSweepMarkdown formats a sweep report for a human (or a CI comment). */
export function renderSweepMarkdown(report: SweepReport): string {
  const lines = [
    "# Semantic cache threshold sweep",
    "",
    `**Recommended \`similarityThreshold\`: ${report.recommended}**`,
    "",
    report.reason,
    "",
    "| Threshold | Hit rate | False-hit rate | Miss rate | Precision |",
    "|-----------|----------|----------------|-----------|-----------|",
    ...report.results.map(
      (r) =>
        `| ${r.threshold} | ${(r.hitRate * 100).toFixed(1)}% | ${(r.falseHitRate * 100).toFixed(2)}% | ${(r.missRate * 100).toFixed(1)}% | ${(r.precision * 100).toFixed(1)}% |`,
    ),
  ];
  return lines.join("\n");
}
