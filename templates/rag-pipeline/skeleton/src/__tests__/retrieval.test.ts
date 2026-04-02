/**
 * Tests for the retrieval module.
 *
 * Uses a mock vector store and embedder to test ranking, filtering,
 * and score thresholding without needing real infrastructure.
 */

import { describe, it, expect } from "vitest";
import { Retriever } from "../retrieval.js";
import type {
  EmbeddingProvider,
  VectorStoreProvider,
  VectorDocument,
  SearchResult,
} from "../providers/types.js";

class MockEmbedder implements EmbeddingProvider {
  readonly dimensions = 4;

  async embed(): Promise<number[]> {
    return [0.1, 0.1, 0.1, 0.1];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.1, 0.1, 0.1]);
  }
}

class MockVectorStore implements VectorStoreProvider {
  private readonly results: SearchResult[];

  constructor(results: SearchResult[] = []) {
    this.results = results;
  }

  async init(): Promise<void> {}

  async addDocuments(_documents: VectorDocument[]): Promise<void> {}

  async search(
    _queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    let results = this.results.slice(0, topK);

    if (filter) {
      results = results.filter((r) =>
        Object.entries(filter).every(([k, v]) => r.metadata[k] === v),
      );
    }

    return results;
  }

  async delete(_ids: string[]): Promise<void> {}
}

function makeResult(
  id: string,
  content: string,
  score: number,
  source = "test.md",
  extra: Record<string, unknown> = {},
): SearchResult {
  return {
    id,
    content,
    score,
    metadata: { source, ...extra },
  };
}

describe("Retriever", () => {
  it("returns results ranked by score descending", async () => {
    const store = new MockVectorStore([
      makeResult("1", "low relevance", 0.3),
      makeResult("2", "high relevance", 0.9),
      makeResult("3", "medium relevance", 0.6),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query");

    const scores = results.map((r) => r.score);
    expect(scores).toEqual([0.9, 0.6, 0.3]);
    expect(results[0].score).toBe(0.9);
    expect(results[results.length - 1].score).toBe(0.3);
  });

  it("assigns 1-indexed rank numbers", async () => {
    const store = new MockVectorStore([
      makeResult("1", "first", 0.9),
      makeResult("2", "second", 0.5),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query");

    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });

  it("filters results below the score threshold", async () => {
    const store = new MockVectorStore([
      makeResult("1", "high", 0.9),
      makeResult("2", "medium", 0.5),
      makeResult("3", "low", 0.1),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10, 0.4);
    const results = await retriever.retrieve("test query");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.score >= 0.4)).toBe(true);
  });

  it("includes all results with zero threshold", async () => {
    const store = new MockVectorStore([
      makeResult("1", "a", 0.9),
      makeResult("2", "b", 0.01),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10, 0.0);
    const results = await retriever.retrieve("test query");

    expect(results).toHaveLength(2);
  });

  it("respects topK override", async () => {
    const store = new MockVectorStore([
      makeResult("1", "a", 0.9),
      makeResult("2", "b", 0.8),
      makeResult("3", "c", 0.7),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query", 2);

    expect(results).toHaveLength(2);
  });

  it("passes metadata filters to the store", async () => {
    const store = new MockVectorStore([
      makeResult("1", "api doc", 0.9, "api.md", { category: "api" }),
      makeResult("2", "guide", 0.8, "guide.md", { category: "guide" }),
      makeResult("3", "api ref", 0.7, "ref.md", { category: "api" }),
    ]);

    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query", undefined, { category: "api" });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.metadata.category === "api")).toBe(true);
  });

  it("populates the source field from metadata", async () => {
    const store = new MockVectorStore([makeResult("1", "content", 0.9, "docs/intro.md")]);

    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query");

    expect(results[0].source).toBe("docs/intro.md");
  });

  it("returns empty array for empty store", async () => {
    const store = new MockVectorStore([]);
    const retriever = new Retriever(new MockEmbedder(), store, 10);
    const results = await retriever.retrieve("test query");

    expect(results).toEqual([]);
  });
});
