/**
 * Integration test for the Chroma vector store provider against a real Chroma
 * server. Skipped unless CHROMA_TEST_URL is set, so the default suite (and CI,
 * which has no server) stays green. To run it locally:
 *
 *   docker run -d --rm -p 8000:8000 chromadb/chroma
 *   CHROMA_TEST_URL=http://localhost:8000 npm test
 *
 * It exercises the full v3 surface the provider uses: a collection with no
 * embedding function (pre-computed embeddings only), upsert, similarity query
 * with the distance→score mapping, and delete.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../chroma.js"; // self-registers the "chroma" provider
import { getVectorStoreProvider } from "../registry.js";
import type { VectorStoreProvider } from "../types.js";

const CHROMA_URL = process.env.CHROMA_TEST_URL;

describe.skipIf(!CHROMA_URL)("ChromaVectorStore (integration)", () => {
  let store: VectorStoreProvider;

  beforeAll(async () => {
    store = getVectorStoreProvider("chroma", {
      backend: "chroma",
      collectionName: `it_${Date.now()}`,
      chromaUrl: CHROMA_URL,
    });
    await store.init();
  });

  it("upserts pre-computed embeddings and ranks a similarity query", async () => {
    await store.addDocuments([
      { id: "a", content: "alpha", embedding: [1, 0, 0], metadata: { kind: "x" } },
      { id: "b", content: "bravo", embedding: [0, 1, 0], metadata: { kind: "y" } },
      { id: "c", content: "charlie", embedding: [0, 0, 1], metadata: { kind: "x" } },
    ]);

    const results = await store.search([0.9, 0.1, 0], 2);
    expect(results.length).toBe(2);
    // Nearest to [0.9,0.1,0] is "a"; scores are similarity (1 - distance).
    expect(results[0].id).toBe("a");
    expect(results[0].content).toBe("alpha");
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].metadata.kind).toBe("x");
  });

  it("applies a metadata filter", async () => {
    const results = await store.search([0, 0, 1], 5, { kind: "x" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.metadata.kind === "x")).toBe(true);
  });

  it("deletes by id", async () => {
    await store.delete(["a"]);
    const results = await store.search([1, 0, 0], 5);
    expect(results.find((r) => r.id === "a")).toBeUndefined();
  });
});
