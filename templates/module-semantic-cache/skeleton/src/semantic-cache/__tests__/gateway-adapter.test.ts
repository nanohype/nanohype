import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSemanticCache } from "../index.js";
import { createSemanticCacheStrategy } from "../gateway-adapter.js";
import type { SemanticCache } from "../index.js";
import type { GatewayCachingStrategy } from "../gateway-adapter.js";

// Import mock embedder and memory store to trigger self-registration
import "../embedder/mock.js";
import "../store/memory.js";

/** Build a minimal response shape that satisfies GatewayCachingStrategy. */
function fakeResponse(text: string) {
  return {
    text,
    model: "gpt-4",
    provider: "openai",
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    cached: false,
    cost: 0,
  };
}

function fakeContext(prompt: string) {
  return { prompt, model: "gpt-4", params: {} };
}

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
    const result = await strategy.get("key-1", fakeContext("What is TypeScript?"));
    expect(result).toBeUndefined();
  });

  it("stores a response via set and retrieves it via get", async () => {
    const ctx = fakeContext("What is TypeScript?");

    await strategy.set("key-1", fakeResponse("TypeScript is ..."), ctx);

    const result = await strategy.get("key-1", ctx);

    expect(result).toBeDefined();
    expect(result!.response.text).toBe("TypeScript is ...");
    expect(result!.response.cached).toBe(true);
    expect(result!.cachedAt).toBeDefined();
  });

  it("invalidates a cached entry", async () => {
    const ctx = fakeContext("What is TypeScript?");

    await strategy.set("key-1", fakeResponse("TypeScript is ..."), ctx);

    // Verify it's stored
    const beforeInvalidate = await strategy.get("key-1", ctx);
    expect(beforeInvalidate).toBeDefined();

    // Reach into the cache's underlying backend (not the strategy's store()
    // method) to find the actual entry id — the adapter's invalidate takes
    // an id, but the strategy.set path generates the id internally.
    const embedding = await cache.embedder.embed(ctx.prompt);
    const hit = await cache.backend.search(embedding, 0.95);
    expect(hit).toBeDefined();

    await strategy.invalidate(hit!.id);

    const afterInvalidate = await strategy.get("key-1", ctx);
    expect(afterInvalidate).toBeUndefined();
  });

  it("closes the underlying cache", async () => {
    const ctx = fakeContext("What is TypeScript?");

    await strategy.set("key-1", fakeResponse("TypeScript is ..."), ctx);

    await strategy.close();

    // After close, the memory store is cleared
    const result = await cache.lookup("What is TypeScript?");
    expect(result).toBeUndefined();
  });
});
