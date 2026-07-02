import { describe, it, expect } from "vitest";
import type { GatewayResponse } from "../types.js";
import type { CacheContext } from "../caching/types.js";

// ── Caching Strategy Tests ──────────────────────────────────────────

const mockResponse: GatewayResponse = {
  text: "Hello world",
  model: "test-model",
  provider: "test-provider",
  inputTokens: 10,
  outputTokens: 5,
  latencyMs: 100,
  cached: false,
  cost: 0.001,
};

const defaultContext: CacheContext = {
  prompt: "Hello",
  model: "test-model",
  params: { temperature: 0.7 },
};

describe("hash caching strategy", () => {
  it("returns undefined on cache miss", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    await import("../caching/hash.js");
    const strategy = getCachingStrategy("hash");

    const result = await strategy.get("nonexistent-key", defaultContext);
    expect(result).toBeUndefined();
  });

  it("returns cached response on hit", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    const strategy = getCachingStrategy("hash");

    await strategy.set("test-key", mockResponse, defaultContext);
    const result = await strategy.get("test-key", defaultContext);

    expect(result).toBeDefined();
    expect(result!.response.text).toBe("Hello world");
    expect(result!.response.cached).toBe(true);
  });

  it("expires entries after TTL", async () => {
    const { createHashStrategy } = await import("../caching/hash.js");
    let clock = 0;
    const strategy = createHashStrategy({ now: () => clock });

    const shortTtlContext = { ...defaultContext, ttl: 50 };
    await strategy.set("expire-key", mockResponse, shortTtlContext);

    // Should exist immediately
    expect(await strategy.get("expire-key", shortTtlContext)).toBeDefined();

    // Tick the injected clock past the TTL — no real waiting
    clock = 60;

    // Should be expired
    expect(await strategy.get("expire-key", shortTtlContext)).toBeUndefined();
  });

  it("invalidates a specific key", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    const strategy = getCachingStrategy("hash");

    await strategy.set("inv-key", mockResponse, defaultContext);
    expect(await strategy.get("inv-key", defaultContext)).toBeDefined();

    await strategy.invalidate("inv-key");
    expect(await strategy.get("inv-key", defaultContext)).toBeUndefined();
  });
});

describe("sliding-ttl caching strategy", () => {
  it("extends TTL on cache hit", async () => {
    const { createSlidingTtlStrategy } = await import("../caching/sliding-ttl.js");
    let clock = 0;
    const strategy = createSlidingTtlStrategy({ now: () => clock });

    const context = { ...defaultContext, ttl: 100 };
    await strategy.set("sliding-key", mockResponse, context);

    // Hit the cache at 60ms to extend the TTL
    clock = 60;
    const result1 = await strategy.get("sliding-key", context);
    expect(result1).toBeDefined();

    // Another 60ms — would have expired without sliding, but TTL was extended
    clock = 120;
    const result2 = await strategy.get("sliding-key", context);
    expect(result2).toBeDefined();
  });
});

describe("none caching strategy", () => {
  it("always returns undefined on get", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    await import("../caching/none.js");
    const strategy = getCachingStrategy("none");

    await strategy.set("test-key", mockResponse, defaultContext);
    const result = await strategy.get("test-key", defaultContext);
    expect(result).toBeUndefined();
  });

  it("invalidate is a no-op", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    const strategy = getCachingStrategy("none");

    // Should not throw
    await strategy.invalidate("any-key");
    await strategy.close();
  });
});
