import { describe, it, expect, vi, afterEach } from "vitest";
import { createRouteLimiter } from "../middleware/rate-limit.js";

// ── Rate Limit Tests ────────────────────────────────────────────────
//
// Validates the token bucket rate limiter: exhaustion, recovery over
// time, per-key isolation, and correct remaining counts.
//

describe("createRouteLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = createRouteLimiter({ limit: 5, window: 60 });

    for (let i = 0; i < 5; i++) {
      const result = limiter.check("client-a");
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects requests after exhaustion", () => {
    const limiter = createRouteLimiter({ limit: 3, window: 60 });

    limiter.check("client-a");
    limiter.check("client-a");
    limiter.check("client-a");

    const result = limiter.check("client-a");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks remaining tokens accurately", () => {
    const limiter = createRouteLimiter({ limit: 5, window: 60 });

    const r1 = limiter.check("client-a");
    expect(r1.remaining).toBe(4);

    const r2 = limiter.check("client-a");
    expect(r2.remaining).toBe(3);
  });

  it("isolates rate limits per key", () => {
    const limiter = createRouteLimiter({ limit: 2, window: 60 });

    limiter.check("client-a");
    limiter.check("client-a");

    // client-b should still have full tokens
    const result = limiter.check("client-b");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("recovers tokens over time", () => {
    vi.useFakeTimers();

    const limiter = createRouteLimiter({ limit: 2, window: 10 }); // 10 second window

    limiter.check("client-a");
    limiter.check("client-a");
    expect(limiter.check("client-a").allowed).toBe(false);

    // Advance time by half the window (5 seconds) — should refill 1 token
    vi.advanceTimersByTime(5_000);

    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
  });

  it("fully replenishes after a full window", () => {
    vi.useFakeTimers();

    const limiter = createRouteLimiter({ limit: 5, window: 10 });

    for (let i = 0; i < 5; i++) {
      limiter.check("client-a");
    }
    expect(limiter.check("client-a").allowed).toBe(false);

    // Advance past the full window
    vi.advanceTimersByTime(10_001);

    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("reset clears a specific key", () => {
    const limiter = createRouteLimiter({ limit: 2, window: 60 });

    limiter.check("client-a");
    limiter.check("client-a");
    expect(limiter.check("client-a").allowed).toBe(false);

    limiter.reset("client-a");

    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("clear removes all keys", () => {
    const limiter = createRouteLimiter({ limit: 1, window: 60 });

    limiter.check("client-a");
    limiter.check("client-b");
    expect(limiter.check("client-a").allowed).toBe(false);
    expect(limiter.check("client-b").allowed).toBe(false);

    limiter.clear();

    expect(limiter.check("client-a").allowed).toBe(true);
    expect(limiter.check("client-b").allowed).toBe(true);
  });

  it("returns a resetAt timestamp in the future", () => {
    const limiter = createRouteLimiter({ limit: 5, window: 60 });
    const now = Date.now();

    const result = limiter.check("client-a");
    expect(result.resetAt).toBeGreaterThanOrEqual(now);
  });
});
