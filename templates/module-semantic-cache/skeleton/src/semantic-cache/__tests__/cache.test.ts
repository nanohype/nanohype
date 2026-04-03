import { describe, it, expect, beforeEach } from "vitest";
import { createSemanticCache } from "../index.js";
import type { SemanticCache } from "../index.js";

// Import mock embedder to trigger self-registration
import "../embedder/mock.js";
// Import memory store to trigger self-registration
import "../store/memory.js";

describe("semantic cache", () => {
  let cache: SemanticCache;

  beforeEach(async () => {
    cache = await createSemanticCache({
      embeddingProvider: "mock",
      vectorBackend: "memory",
      similarityThreshold: 0.95,
      defaultTtlMs: 60_000,
    });
  });

  // Clean up after each test
  afterEach(async () => {
    await cache.close();
  });

  it("stores a response and retrieves it by the same prompt", async () => {
    await cache.store("What is TypeScript?", "TypeScript is a typed superset of JavaScript.");

    const hit = await cache.lookup("What is TypeScript?");

    expect(hit).toBeDefined();
    expect(hit!.response).toBe("TypeScript is a typed superset of JavaScript.");
    expect(hit!.score).toBeCloseTo(1, 5);
  });

  it("returns undefined for a prompt with no similar cached entry", async () => {
    await cache.store("What is TypeScript?", "TypeScript is a typed superset of JavaScript.");

    // A completely different prompt should not match with high threshold
    const hit = await cache.lookup("How do I cook pasta?");

    expect(hit).toBeUndefined();
  });

  it("returns undefined when the cache is empty", async () => {
    const hit = await cache.lookup("anything");

    expect(hit).toBeUndefined();
  });

  it("respects TTL expiration", async () => {
    // Store with a 1ms TTL
    await cache.store("What is TypeScript?", "TypeScript is ...", 1);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 10));

    const hit = await cache.lookup("What is TypeScript?");
    expect(hit).toBeUndefined();
  });

  it("invalidates a cache entry by id", async () => {
    await cache.store("What is TypeScript?", "TypeScript is ...");

    // The mock embedder is deterministic, so same prompt produces same embedding.
    // Look up to get the entry, then find its id by searching the store directly.
    const hit = await cache.lookup("What is TypeScript?");
    expect(hit).toBeDefined();

    // Get the id from the store's search result metadata
    const embedding = await cache.embedder.embed("What is TypeScript?");
    const searchHit = await cache.backend.search(embedding, 0.95);
    expect(searchHit).toBeDefined();

    await cache.invalidate(searchHit!.id);

    // Should no longer be found
    const afterInvalidate = await cache.lookup("What is TypeScript?");
    expect(afterInvalidate).toBeUndefined();
  });

  it("handles multiple cached entries and returns the best match", async () => {
    await cache.store("What is TypeScript?", "TS answer");
    await cache.store("What is JavaScript?", "JS answer");

    // Exact match should return the TypeScript answer
    const hit = await cache.lookup("What is TypeScript?");

    expect(hit).toBeDefined();
    expect(hit!.response).toBe("TS answer");
  });

  it("stores entries with custom TTL that persists beyond default", async () => {
    // Create cache with very short default TTL
    const shortCache = await createSemanticCache({
      embeddingProvider: "mock",
      vectorBackend: "memory",
      similarityThreshold: 0.95,
      defaultTtlMs: 1, // 1ms default
    });

    // Store with explicit long TTL
    await shortCache.store("persistent prompt", "persistent response", 60_000);

    // Wait for default TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should still be found because we used custom TTL
    const hit = await shortCache.lookup("persistent prompt");
    expect(hit).toBeDefined();
    expect(hit!.response).toBe("persistent response");

    await shortCache.close();
  });
});
