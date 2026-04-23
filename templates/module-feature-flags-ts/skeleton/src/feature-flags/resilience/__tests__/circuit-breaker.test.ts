import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
} from "../circuit-breaker.js";

describe("circuit breaker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through when closed", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after N failures within the sliding window", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, windowMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("open");
  });

  it("does not open when failures are spread outside the window", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 3, windowMs: 100 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");

    vi.advanceTimersByTime(150);

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("throws CircuitBreakerOpenError when open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to half-open after timeout", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 60));

    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("reset returns to closed", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");

    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });
});
