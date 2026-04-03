import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker } from "../circuit-breaker.js";

describe("circuit breaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe("closed");
  });

  it("passes through successful calls", async () => {
    const result = await breaker.execute(async () => 42);

    expect(result).toBe(42);
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const fail = () => breaker.execute(async () => { throw new Error("fail"); });

    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");

    expect(breaker.getState()).toBe("open");
    expect(breaker.getFailureCount()).toBe(3);
  });

  it("rejects calls immediately when open", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await expect(
      breaker.execute(async () => "should not run"),
    ).rejects.toThrow("Circuit breaker is open");
  });

  it("transitions to half-open after reset timeout", async () => {
    vi.useFakeTimers();

    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    expect(breaker.getState()).toBe("open");

    // Advance past reset timeout
    vi.advanceTimersByTime(1500);

    // Next call should be allowed (half-open)
    const result = await breaker.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(breaker.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("re-opens on failure in half-open state", async () => {
    vi.useFakeTimers();

    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    vi.advanceTimersByTime(1500);

    // Fail in half-open
    await breaker.execute(async () => { throw new Error("still broken"); }).catch(() => {});

    expect(breaker.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("resets to closed state", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    breaker.reset();

    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailureCount()).toBe(0);
  });

  it("resets failure count on success", async () => {
    // Two failures (below threshold)
    await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});

    expect(breaker.getFailureCount()).toBe(2);

    // One success resets the count
    await breaker.execute(async () => "ok");

    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe("closed");
  });
});
