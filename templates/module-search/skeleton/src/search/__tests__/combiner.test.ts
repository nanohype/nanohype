import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "../hybrid/combiner.js";
import type { RankableHit } from "../hybrid/combiner.js";

// ── RRF Combiner Tests ───────────────────────────────────────────
//
// Validates reciprocal rank fusion merging: disjoint lists,
// overlapping lists, empty lists, and k parameter effect.
//

function hit(id: string, score: number = 1): RankableHit {
  return { id, content: `content for ${id}`, score, metadata: {} };
}

describe("reciprocalRankFusion", () => {
  it("merges disjoint result lists", () => {
    const keyword = [hit("a"), hit("b"), hit("c")];
    const vector = [hit("d"), hit("e"), hit("f")];

    const result = reciprocalRankFusion(keyword, vector);

    expect(result.totalHits).toBe(6);
    expect(result.hits).toHaveLength(6);

    // All items should be present
    const ids = result.hits.map((h) => h.id);
    expect(ids).toContain("a");
    expect(ids).toContain("d");
  });

  it("boosts items appearing in both lists", () => {
    const keyword = [hit("a"), hit("b"), hit("c")];
    const vector = [hit("b"), hit("d"), hit("a")];

    const result = reciprocalRankFusion(keyword, vector);

    // "a" and "b" appear in both lists and should have higher scores
    const aScore = result.hits.find((h) => h.id === "a")!.rrfScore;
    const cScore = result.hits.find((h) => h.id === "c")!.rrfScore;
    const dScore = result.hits.find((h) => h.id === "d")!.rrfScore;

    expect(aScore).toBeGreaterThan(cScore);
    expect(aScore).toBeGreaterThan(dScore);
  });

  it("handles empty keyword results", () => {
    const keyword: RankableHit[] = [];
    const vector = [hit("a"), hit("b")];

    const result = reciprocalRankFusion(keyword, vector);

    expect(result.totalHits).toBe(2);
    expect(result.hits[0].id).toBe("a");
    expect(result.hits[1].id).toBe("b");
  });

  it("handles empty vector results", () => {
    const keyword = [hit("a"), hit("b")];
    const vector: RankableHit[] = [];

    const result = reciprocalRankFusion(keyword, vector);

    expect(result.totalHits).toBe(2);
    expect(result.hits[0].id).toBe("a");
    expect(result.hits[1].id).toBe("b");
  });

  it("handles both empty lists", () => {
    const result = reciprocalRankFusion([], []);

    expect(result.totalHits).toBe(0);
    expect(result.hits).toHaveLength(0);
  });

  it("respects k parameter effect on scoring", () => {
    const keyword = [hit("a"), hit("b")];
    const vector = [hit("a"), hit("b")];

    // Lower k = more emphasis on rank position
    const lowK = reciprocalRankFusion(keyword, vector, 1);
    // Higher k = more uniform scores
    const highK = reciprocalRankFusion(keyword, vector, 1000);

    const lowKDiff =
      lowK.hits.find((h) => h.id === "a")!.rrfScore -
      lowK.hits.find((h) => h.id === "b")!.rrfScore;

    const highKDiff =
      highK.hits.find((h) => h.id === "a")!.rrfScore -
      highK.hits.find((h) => h.id === "b")!.rrfScore;

    // With low k, the difference between rank 1 and rank 2 should be larger
    expect(lowKDiff).toBeGreaterThan(highKDiff);
  });

  it("preserves metadata from original hits", () => {
    const keyword = [{ id: "a", content: "test", score: 1, metadata: { source: "keyword" } }];
    const vector = [{ id: "b", content: "test", score: 1, metadata: { source: "vector" } }];

    const result = reciprocalRankFusion(keyword, vector);

    const a = result.hits.find((h) => h.id === "a")!;
    const b = result.hits.find((h) => h.id === "b")!;

    expect(a.metadata.source).toBe("keyword");
    expect(b.metadata.source).toBe("vector");
  });

  it("produces descending RRF scores", () => {
    const keyword = [hit("a"), hit("b"), hit("c")];
    const vector = [hit("d"), hit("e"), hit("f")];

    const result = reciprocalRankFusion(keyword, vector);

    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i - 1].rrfScore).toBeGreaterThanOrEqual(result.hits[i].rrfScore);
    }
  });

  it("is compatible with vector-store SearchResult shape", () => {
    // module-vector-store's SearchResult has { id, content, score, metadata }
    const vectorStoreResults: RankableHit[] = [
      { id: "v1", content: "vector doc 1", score: 0.95, metadata: { chunk: 0 } },
      { id: "v2", content: "vector doc 2", score: 0.87, metadata: { chunk: 1 } },
    ];

    const keywordResults: RankableHit[] = [
      { id: "k1", content: "keyword doc 1", score: 5.2, metadata: {} },
      { id: "v1", content: "vector doc 1", score: 3.1, metadata: { chunk: 0 } },
    ];

    const result = reciprocalRankFusion(keywordResults, vectorStoreResults);

    // v1 appears in both, should rank highest
    expect(result.hits[0].id).toBe("v1");
    expect(result.totalHits).toBe(3); // k1, v1, v2
  });
});
