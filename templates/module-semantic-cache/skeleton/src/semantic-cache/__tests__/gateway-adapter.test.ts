import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSemanticCache } from "../index.js";
import { createSemanticCacheStrategy } from "../gateway-adapter.js";
import type { SemanticCache } from "../index.js";
import type { GatewayCachingStrategy } from "../gateway-adapter.js";

// Import mock embedder and memory store to trigger self-registration
import "../embedder/mock.js";
import "../store/memory.js";

describe("gateway adapter", () => {
  let cache: SemanticCache;
  let strategy: GatewayCachingStrategy;

  beforeEach(async () => {
    cache = await createSemanticCache({
      embeddingProvider: "mock",
      vectorBackend: "memory",
      similarityThreshold: 0.95,
      defaultTtlMs: 60_000,
    });
    strategy = createSemanticCacheStrategy(cache);
  });

  afterEach(async () => {
    await strategy.close();
  });

  it("has the correct name", () => {
    expect(strategy.name).toBe("semantic-cache");
  });

  it("returns undefined from get when cache is empty", async () => {
    const result = await strategy.get("key-1", {
      prompt: "What is TypeScript?",
      model: "gpt-4",
    });

    expect(result).toBeUndefined();
  });

  it("stores a response via set and retrieves it via get", async () => {
    const context = {
      prompt: "What is TypeScript?",
      model: "gpt-4",
    };

    await strategy.set("key-1", { body: "TypeScript is ..." }, context);

    const result = await strategy.get("key-1", context);

    expect(result).toBeDefined();
    expect(result!.body).toBe("TypeScript is ...");
    expect(result!.metadata).toBeDefined();
    expect(result!.metadata!.score).toBeCloseTo(1, 5);
    expect(result!.metadata!.model).toBe("gpt-4");
  });

  it("invalidates a cached entry", async () => {
    const context = {
      prompt: "What is TypeScript?",
      model: "gpt-4",
    };

    await strategy.set("key-1", { body: "TypeScript is ..." }, context);

    // Verify it's stored
    const beforeInvalidate = await strategy.get("key-1", context);
    expect(beforeInvalidate).toBeDefined();

    // Find the actual entry id via the underlying store
    const embedding = await cache.embedder.embed(context.prompt);
    const hit = await cache.store.search(embedding, 0.95);
    expect(hit).toBeDefined();

    // Invalidate by the real id
    await strategy.invalidate(hit!.id);

    const afterInvalidate = await strategy.get("key-1", context);
    expect(afterInvalidate).toBeUndefined();
  });

  it("closes the underlying cache", async () => {
    const context = {
      prompt: "What is TypeScript?",
      model: "gpt-4",
    };

    await strategy.set("key-1", { body: "TypeScript is ..." }, context);

    await strategy.close();

    // After close, the memory store is cleared
    const result = await cache.lookup("What is TypeScript?");
    expect(result).toBeUndefined();
  });
});
