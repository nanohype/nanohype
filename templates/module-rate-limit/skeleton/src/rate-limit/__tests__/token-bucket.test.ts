import { describe, it, expect, beforeEach } from "vitest";

// Import stores and algorithms to trigger self-registration
import "../stores/memory.js";
import "../algorithms/token-bucket.js";
import { getAlgorithm } from "../algorithms/registry.js";
import { getStore } from "../stores/registry.js";
import type { RateLimitAlgorithm } from "../algorithms/types.js";
import type { RateLimitStore } from "../stores/types.js";

describe("token bucket algorithm", () => {
  let algorithm: RateLimitAlgorithm;
  let store: RateLimitStore;

  beforeEach(async () => {
    algorithm = getAlgorithm("token-bucket");
    store = getStore("memory");
    await store.close();
    await store.init({});
  });

  it("is registered under the name 'token-bucket'", () => {
    expect(algorithm.name).toBe("token-bucket");
  });

  it("allows the first request", async () => {
    const result = await algorithm.check("user:1", 10, 60_000, store);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
  });

  it("decrements remaining tokens on each request", async () => {
    await algorithm.check("user:2", 5, 60_000, store);
    await algorithm.check("user:2", 5, 60_000, store);
    const result = await algorithm.check("user:2", 5, 60_000, store);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("rejects when all tokens are consumed", async () => {
    const limit = 3;
    const key = "user:3";

    // Consume all tokens
    for (let i = 0; i < limit; i++) {
      const r = await algorithm.check(key, limit, 60_000, store);
      expect(r.allowed).toBe(true);
    }

    // Next request should be rejected
    const result = await algorithm.check(key, limit, 60_000, store);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("includes resetAt in the result", async () => {
    const now = Date.now();
    const result = await algorithm.check("user:4", 10, 60_000, store);

    expect(result.resetAt).toBeGreaterThanOrEqual(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000 + 100);
  });

  it("resets state for a key", async () => {
    const key = "user:5";

    // Consume some tokens
    await algorithm.check(key, 3, 60_000, store);
    await algorithm.check(key, 3, 60_000, store);

    // Reset
    await algorithm.reset(key, store);

    // Should be back to full bucket
    const result = await algorithm.check(key, 3, 60_000, store);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("handles different keys independently", async () => {
    await algorithm.check("a", 2, 60_000, store);
    await algorithm.check("a", 2, 60_000, store);

    // Key "a" should be exhausted
    const resultA = await algorithm.check("a", 2, 60_000, store);
    expect(resultA.allowed).toBe(false);

    // Key "b" should still have tokens
    const resultB = await algorithm.check("b", 2, 60_000, store);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(1);
  });
});
