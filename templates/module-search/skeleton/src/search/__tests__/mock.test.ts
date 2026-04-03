import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";
import type { SearchProvider } from "../providers/types.js";

// ── Mock Provider Tests ──────────────────────────────────────────
//
// Validates index CRUD, document indexing, TF-IDF text search,
// facet counting, pagination, and filtering for the in-memory
// mock search provider.
//

describe("mock search provider", () => {
  let provider: SearchProvider;

  beforeEach(async () => {
    provider = getProvider("mock");
    await provider.close();
    await provider.init({});
  });

  it("creates independent instances (factory pattern)", () => {
    const a = getProvider("mock");
    const b = getProvider("mock");
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });

  describe("index CRUD", () => {
    it("creates and retrieves an index", async () => {
      await provider.createIndex({
        name: "articles",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
          { name: "category", type: "string", facet: true },
        ],
      });

      const index = await provider.getIndex("articles");
      expect(index).toBeDefined();
      expect(index!.name).toBe("articles");
      expect(index!.fields).toHaveLength(3);
    });

    it("returns undefined for a nonexistent index", async () => {
      const index = await provider.getIndex("nonexistent");
      expect(index).toBeUndefined();
    });

    it("deletes an index and its documents", async () => {
      await provider.createIndex({
        name: "to-delete",
        fields: [{ name: "id", type: "string", primary: true }],
      });

      await provider.indexDocuments("to-delete", [
        { id: "1", content: "test", metadata: {} },
      ]);

      await provider.deleteIndex("to-delete");

      const index = await provider.getIndex("to-delete");
      expect(index).toBeUndefined();

      const result = await provider.search("to-delete", { query: "test" });
      expect(result.hits).toHaveLength(0);
    });
  });

  describe("document indexing", () => {
    it("indexes documents and retrieves them via search", async () => {
      await provider.createIndex({
        name: "docs",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
        ],
      });

      await provider.indexDocuments("docs", [
        { id: "1", content: "TypeScript is a typed superset of JavaScript", metadata: {} },
        { id: "2", content: "Python is great for data science", metadata: {} },
      ]);

      const result = await provider.search("docs", { query: "TypeScript" });
      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.hits[0].id).toBe("1");
    });

    it("deletes documents by ID", async () => {
      await provider.createIndex({
        name: "del-test",
        fields: [{ name: "id", type: "string", primary: true }, { name: "content", type: "string" }],
      });

      await provider.indexDocuments("del-test", [
        { id: "a", content: "hello world", metadata: {} },
        { id: "b", content: "hello planet", metadata: {} },
      ]);

      await provider.deleteDocuments("del-test", ["a"]);

      const result = await provider.search("del-test", { query: "hello" });
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].id).toBe("b");
    });
  });

  describe("text search", () => {
    beforeEach(async () => {
      await provider.createIndex({
        name: "search-test",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
          { name: "category", type: "string", facet: true },
        ],
      });

      await provider.indexDocuments("search-test", [
        { id: "1", content: "The quick brown fox jumps over the lazy dog", metadata: { category: "animals" } },
        { id: "2", content: "A fast brown fox runs through the forest", metadata: { category: "animals" } },
        { id: "3", content: "TypeScript improves developer productivity", metadata: { category: "tech" } },
        { id: "4", content: "The lazy cat sleeps all day", metadata: { category: "animals" } },
      ]);
    });

    it("ranks documents by TF-IDF relevance", async () => {
      const result = await provider.search("search-test", { query: "brown fox" });

      expect(result.hits.length).toBeGreaterThanOrEqual(2);
      // Both docs with "brown fox" should be at the top
      const ids = result.hits.map((h) => h.id);
      expect(ids).toContain("1");
      expect(ids).toContain("2");
    });

    it("returns totalHits count", async () => {
      const result = await provider.search("search-test", { query: "brown fox" });
      expect(result.totalHits).toBeGreaterThanOrEqual(2);
    });

    it("returns processingTimeMs", async () => {
      const result = await provider.search("search-test", { query: "fox" });
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("returns empty results for non-matching query", async () => {
      const result = await provider.search("search-test", { query: "xyzzy" });
      expect(result.hits).toHaveLength(0);
      expect(result.totalHits).toBe(0);
    });

    it("returns scores greater than zero for matches", async () => {
      const result = await provider.search("search-test", { query: "fox" });
      for (const hit of result.hits) {
        expect(hit.score).toBeGreaterThan(0);
      }
    });
  });

  describe("facets", () => {
    beforeEach(async () => {
      await provider.createIndex({
        name: "facet-test",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
          { name: "category", type: "string", facet: true },
        ],
      });

      await provider.indexDocuments("facet-test", [
        { id: "1", content: "fox animal", metadata: { category: "animals" } },
        { id: "2", content: "dog animal", metadata: { category: "animals" } },
        { id: "3", content: "code animal programming", metadata: { category: "tech" } },
      ]);
    });

    it("returns facet counts for requested fields", async () => {
      const result = await provider.search("facet-test", {
        query: "animal",
        facets: ["category"],
      });

      expect(result.facetCounts).toBeDefined();
      expect(result.facetCounts!.category).toBeDefined();
      expect(result.facetCounts!.category.animals).toBeGreaterThanOrEqual(1);
    });

    it("returns no facetCounts when facets not requested", async () => {
      const result = await provider.search("facet-test", { query: "animal" });
      expect(result.facetCounts).toBeUndefined();
    });
  });

  describe("pagination", () => {
    beforeEach(async () => {
      await provider.createIndex({
        name: "page-test",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
        ],
      });

      const docs = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        content: `document about search testing number ${i}`,
        metadata: {},
      }));

      await provider.indexDocuments("page-test", docs);
    });

    it("respects limit parameter", async () => {
      const result = await provider.search("page-test", {
        query: "search testing",
        limit: 5,
      });

      expect(result.hits).toHaveLength(5);
      expect(result.totalHits).toBe(15);
    });

    it("respects offset parameter", async () => {
      const first = await provider.search("page-test", {
        query: "search testing",
        limit: 5,
        offset: 0,
      });

      const second = await provider.search("page-test", {
        query: "search testing",
        limit: 5,
        offset: 5,
      });

      // Pages should not overlap
      const firstIds = first.hits.map((h) => h.id);
      const secondIds = second.hits.map((h) => h.id);
      for (const id of secondIds) {
        expect(firstIds).not.toContain(id);
      }
    });
  });

  describe("filters", () => {
    beforeEach(async () => {
      await provider.createIndex({
        name: "filter-test",
        fields: [
          { name: "id", type: "string", primary: true },
          { name: "content", type: "string" },
          { name: "category", type: "string", facet: true },
          { name: "priority", type: "number" },
        ],
      });

      await provider.indexDocuments("filter-test", [
        { id: "1", content: "important task work", metadata: { category: "work", priority: 1 } },
        { id: "2", content: "casual task personal", metadata: { category: "personal", priority: 3 } },
        { id: "3", content: "urgent task work", metadata: { category: "work", priority: 5 } },
      ]);
    });

    it("filters by equality", async () => {
      const result = await provider.search("filter-test", {
        query: "task",
        filter: { field: "category", operator: "=", value: "work" },
      });

      expect(result.hits).toHaveLength(2);
      for (const hit of result.hits) {
        expect(hit.metadata.category).toBe("work");
      }
    });

    it("filters by numeric comparison", async () => {
      const result = await provider.search("filter-test", {
        query: "task",
        filter: { field: "priority", operator: ">", value: 2 },
      });

      expect(result.hits).toHaveLength(2);
      for (const hit of result.hits) {
        expect(hit.metadata.priority).toBeGreaterThan(2);
      }
    });

    it("filters with AND logic", async () => {
      const result = await provider.search("filter-test", {
        query: "task",
        filter: {
          and: [
            { field: "category", operator: "=", value: "work" },
            { field: "priority", operator: ">=", value: 5 },
          ],
        },
      });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].id).toBe("3");
    });
  });
});
