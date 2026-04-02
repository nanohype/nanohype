/**
 * Evaluation metrics for comparing model outputs.
 *
 * Provides lightweight, no-dependency metrics for assessing quality
 * differences between a base model and a fine-tuned model. These are
 * heuristic measures — for production eval, pair with the eval-harness
 * template for assertion-based testing.
 */

/**
 * Result of a single comparison between base and fine-tuned outputs.
 */
export interface ComparisonResult {
  prompt: string;
  baseOutput: string;
  fineTunedOutput: string;
  metrics: {
    lengthRatio: number;
    exactMatch: boolean;
    overlapScore: number;
  };
}

/**
 * Aggregate metrics across all comparisons.
 */
export interface AggregateMetrics {
  totalComparisons: number;
  exactMatchRate: number;
  averageLengthRatio: number;
  averageOverlapScore: number;
  averageFineTunedLength: number;
  averageBaseLength: number;
}

/**
 * Compute token-level overlap between two strings using word sets.
 * Returns a value between 0 and 1, where 1 means identical word sets.
 */
export function computeOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Compute comparison metrics for a single prompt.
 */
export function computeComparisonMetrics(
  prompt: string,
  baseOutput: string,
  fineTunedOutput: string,
): ComparisonResult {
  const baseLen = baseOutput.length;
  const ftLen = fineTunedOutput.length;

  return {
    prompt,
    baseOutput,
    fineTunedOutput,
    metrics: {
      lengthRatio: baseLen > 0 ? ftLen / baseLen : ftLen > 0 ? Infinity : 1,
      exactMatch: baseOutput.trim() === fineTunedOutput.trim(),
      overlapScore: computeOverlap(baseOutput, fineTunedOutput),
    },
  };
}

/**
 * Compute aggregate metrics across all comparison results.
 */
export function computeAggregateMetrics(
  results: ComparisonResult[],
): AggregateMetrics {
  if (results.length === 0) {
    return {
      totalComparisons: 0,
      exactMatchRate: 0,
      averageLengthRatio: 0,
      averageOverlapScore: 0,
      averageFineTunedLength: 0,
      averageBaseLength: 0,
    };
  }

  const n = results.length;
  const exactMatches = results.filter((r) => r.metrics.exactMatch).length;

  const totalLengthRatio = results.reduce(
    (sum, r) => sum + (isFinite(r.metrics.lengthRatio) ? r.metrics.lengthRatio : 0),
    0,
  );
  const totalOverlap = results.reduce((sum, r) => sum + r.metrics.overlapScore, 0);
  const totalFtLength = results.reduce((sum, r) => sum + r.fineTunedOutput.length, 0);
  const totalBaseLength = results.reduce((sum, r) => sum + r.baseOutput.length, 0);

  return {
    totalComparisons: n,
    exactMatchRate: exactMatches / n,
    averageLengthRatio: totalLengthRatio / n,
    averageOverlapScore: totalOverlap / n,
    averageFineTunedLength: totalFtLength / n,
    averageBaseLength: totalBaseLength / n,
  };
}
