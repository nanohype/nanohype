// ── Reciprocal Rank Fusion ─────────────────────────────────────────
//
// Merges keyword search results and vector search results into a
// single ranked list using Reciprocal Rank Fusion (RRF).
//
// RRF score for each item = sum(1 / (k + rank)) across all result
// lists where the item appears. Items in both lists get summed
// scores. Default k=60 (standard RRF constant).
//
// Compatible with both this module's SearchResult shape and
// module-vector-store's SearchResult shape. The combiner accepts
// a minimal common interface: arrays of objects with { id, content,
// score, metadata }.
//

/** Minimal hit shape accepted by the combiner. */
export interface RankableHit {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Merged result from reciprocal rank fusion. */
export interface RRFResult {
  /** Merged hits ordered by combined RRF score (descending). */
  hits: Array<RankableHit & { rrfScore: number }>;

  /** Total unique items across both result sets. */
  totalHits: number;
}

/**
 * Merge two ranked result lists using Reciprocal Rank Fusion.
 *
 * @param keywordResults  Hits from keyword/full-text search, ordered by relevance.
 * @param vectorResults   Hits from vector/semantic search, ordered by similarity.
 * @param k               RRF constant (default 60). Higher values reduce the
 *                        influence of high-ranked items.
 * @returns               Merged results sorted by combined RRF score.
 */
export function reciprocalRankFusion(
  keywordResults: RankableHit[],
  vectorResults: RankableHit[],
  k: number = 60,
): RRFResult {
  const scores = new Map<string, { hit: RankableHit; rrfScore: number }>();

  // Score keyword results by rank position
  for (let i = 0; i < keywordResults.length; i++) {
    const hit = keywordResults[i];
    const rrfScore = 1 / (k + i + 1); // rank is 1-based
    const existing = scores.get(hit.id);
    if (existing) {
      existing.rrfScore += rrfScore;
    } else {
      scores.set(hit.id, { hit, rrfScore });
    }
  }

  // Score vector results by rank position
  for (let i = 0; i < vectorResults.length; i++) {
    const hit = vectorResults[i];
    const rrfScore = 1 / (k + i + 1);
    const existing = scores.get(hit.id);
    if (existing) {
      existing.rrfScore += rrfScore;
    } else {
      scores.set(hit.id, { hit, rrfScore });
    }
  }

  // Sort by combined RRF score descending
  const merged = Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ hit, rrfScore }) => ({ ...hit, rrfScore }));

  return {
    hits: merged,
    totalHits: merged.length,
  };
}
