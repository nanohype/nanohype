import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCircuitBreaker } from "../circuit-breaker.js";
import type { Logger } from "../../logger.js";

// ── Circuit Breaker Tests ───────────────────────────────────────────
//
// Validates the sliding-window circuit breaker state machine:
// closed -> open -> half-open -> closed (or back to open).
//

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("circuit-breaker", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("starts in closed state", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger);
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("stays closed when failures are below threshold", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 4,
    });

    cb.recordSuccess();
    cb.recordSuccess();
    cb.recordSuccess();
    cb.recordFailure();

    // 1/4 = 25% failure rate, below 50% threshold
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("opens when failure rate exceeds threshold", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 4,
    });

    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();

    // 4/5 = 80% failure rate, above 50% threshold
    expect(cb.state).toBe("open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("does not open before minimum requests are reached", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 10,
    });

    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }

    // 5/5 = 100% failure rate, but only 5 requests (below minimum of 10)
    expect(cb.state).toBe("closed");
  });

  it("transitions from open to half-open after timeout", () => {
    vi.useFakeTimers();

    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 2,
      openDurationMs: 5_000,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("open");

    vi.advanceTimersByTime(5_001);
    expect(cb.state).toBe("half-open");
    expect(cb.allowRequest()).toBe(true);

    vi.useRealTimers();
  });

  it("closes from half-open on success", () => {
    vi.useFakeTimers();

    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 2,
      openDurationMs: 5_000,
    });

    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5_001);
    expect(cb.state).toBe("half-open");

    cb.recordSuccess();
    expect(cb.state).toBe("closed");

    vi.useRealTimers();
  });

  it("reopens from half-open on failure", () => {
    vi.useFakeTimers();

    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 2,
      openDurationMs: 5_000,
    });

    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5_001);
    expect(cb.state).toBe("half-open");

    cb.recordFailure();
    expect(cb.state).toBe("open");

    vi.useRealTimers();
  });

  it("reset returns to closed state", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger, {
      failureThreshold: 0.5,
      minimumRequests: 2,
    });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("open");

    cb.reset();
    expect(cb.state).toBe("closed");
    expect(cb.stats().windowSize).toBe(0);
  });

  it("stats returns diagnostic info", () => {
    const cb = createCircuitBreaker("http://upstream:3000", logger);

    cb.recordSuccess();
    cb.recordFailure();

    const stats = cb.stats();
    expect(stats.upstreamUrl).toBe("http://upstream:3000");
    expect(stats.state).toBe("closed");
    expect(stats.windowSize).toBe(2);
    expect(stats.failureRate).toBe(0.5);
  });
});
