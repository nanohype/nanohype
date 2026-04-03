import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Import the memory provider module to trigger self-registration
import "../providers/memory.js";
import { getProvider } from "../providers/registry.js";
import type { VectorStoreProvider } from "../providers/types.js";
import type { VectorDocument } from "../types.js";

describe("memory vector store provider", () => {
  let provider: VectorStoreProvider;

  // Helpers for creating test documents with simple embeddings
  function makeDoc(id: string, embedding: number[], metadata: Record<string, unknown> = {}): VectorDocument {
    return { id, content: `Content for ${id}`, embedding, metadata };
  }

  beforeEach(async () => {
    provider = getProvider("memory");
    await provider.init({});
  });

  afterEach(async () => {
    await provider.close();
  });

  it("is registered under the name 'memory'", () => {
    expect(provider.name).toBe("memory");
  });

  it("upserts documents and queries with cosine ranking", async () => {
    const queryVec = [1, 0, 0];

    await provider.upsert([
      makeDoc("close", [0.9, 0.1, 0]),    // most similar to [1,0,0]
      makeDoc("medium", [0.5, 0.5, 0]),   // moderately similar
      makeDoc("far", [0, 0, 1]),           // orthogonal
    ]);

    const results = await provider.query(queryVec, 3);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("close");
    expect(results[1].id).toBe("medium");
    expect(results[2].id).toBe("far");
    // Highest score first
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("respects topK limit", async () => {
    await provider.upsert([
      makeDoc("a", [1, 0]),
      makeDoc("b", [0, 1]),
      makeDoc("c", [0.5, 0.5]),
    ]);

    const results = await provider.query([1, 0], 2);

    expect(results).toHaveLength(2);
  });

  it("delete removes documents from results", async () => {
    await provider.upsert([
      makeDoc("keep", [1, 0]),
      makeDoc("remove", [0.9, 0.1]),
    ]);

    await provider.delete(["remove"]);

    const results = await provider.query([1, 0], 10);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("keep");
    expect(ids).not.toContain("remove");
  });

  it("filters by metadata (eq)", async () => {
    await provider.upsert([
      makeDoc("en-doc", [1, 0], { language: "en" }),
      makeDoc("fr-doc", [0.9, 0.1], { language: "fr" }),
    ]);

    const results = await provider.query([1, 0], 10, {
      field: "language",
      op: "eq",
      value: "en",
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("en-doc");
  });

  it("filters by metadata (in)", async () => {
    await provider.upsert([
      makeDoc("ts", [1, 0], { language: "typescript" }),
      makeDoc("py", [0.9, 0.1], { language: "python" }),
      makeDoc("go", [0.8, 0.2], { language: "go" }),
    ]);

    const results = await provider.query([1, 0], 10, {
      field: "language",
      op: "in",
      value: ["typescript", "go"],
    });

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("ts");
    expect(ids).toContain("go");
    expect(ids).not.toContain("py");
  });

  it("filters with AND combinator", async () => {
    await provider.upsert([
      makeDoc("match", [1, 0], { language: "en", score: 0.9 }),
      makeDoc("wrong-lang", [0.9, 0.1], { language: "fr", score: 0.9 }),
      makeDoc("low-score", [0.8, 0.2], { language: "en", score: 0.2 }),
    ]);

    const results = await provider.query([1, 0], 10, {
      and: [
        { field: "language", op: "eq", value: "en" },
        { field: "score", op: "gte", value: 0.5 },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("match");
  });

  it("filters with OR combinator", async () => {
    await provider.upsert([
      makeDoc("en-doc", [1, 0], { language: "en" }),
      makeDoc("fr-doc", [0.9, 0.1], { language: "fr" }),
      makeDoc("de-doc", [0.8, 0.2], { language: "de" }),
    ]);

    const results = await provider.query([1, 0], 10, {
      or: [
        { field: "language", op: "eq", value: "en" },
        { field: "language", op: "eq", value: "fr" },
      ],
    });

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("en-doc");
    expect(ids).toContain("fr-doc");
    expect(ids).not.toContain("de-doc");
  });

  it("returns empty array when store is empty", async () => {
    const results = await provider.query([1, 0, 0], 10);

    expect(results).toEqual([]);
  });

  it("count returns accurate document count", async () => {
    expect(await provider.count()).toBe(0);

    await provider.upsert([
      makeDoc("a", [1, 0]),
      makeDoc("b", [0, 1]),
    ]);

    expect(await provider.count()).toBe(2);

    await provider.delete(["a"]);

    expect(await provider.count()).toBe(1);
  });

  it("upsert overwrites existing document with same ID", async () => {
    await provider.upsert([makeDoc("doc", [1, 0], { version: 1 })]);
    await provider.upsert([makeDoc("doc", [0, 1], { version: 2 })]);

    expect(await provider.count()).toBe(1);

    const results = await provider.query([0, 1], 1);
    expect(results[0].metadata.version).toBe(2);
  });
});
