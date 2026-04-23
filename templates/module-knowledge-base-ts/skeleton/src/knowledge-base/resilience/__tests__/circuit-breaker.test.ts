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

    // Two failures inside the window
    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");

    // Advance time so the first two failures expire
    vi.advanceTimersByTime(150);

    // Third failure -- only 1 failure in the current window
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

    // Wait for the reset timeout
    await new Promise((r) => setTimeout(r, 60));

    // Next call should transition to half-open and execute
    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("closes on success in half-open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");

    await new Promise((r) => setTimeout(r, 60));

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens on failure in half-open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 60));

    // Fail again during half-open -- should re-open
    await expect(cb.execute(() => Promise.reject(new Error("fail again")))).rejects.toThrow("fail again");
    expect(cb.getState()).toBe("open");
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

  it("sliding window decays old failures naturally", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 3, windowMs: 200 });

    // Fail twice
    await expect(cb.execute(() => Promise.reject(new Error("f1")))).rejects.toThrow("f1");
    await expect(cb.execute(() => Promise.reject(new Error("f2")))).rejects.toThrow("f2");
    expect(cb.getState()).toBe("closed");

    // Advance time so first two expire
    vi.advanceTimersByTime(250);

    // Fail twice more -- only 2 in window, still under threshold of 3
    await expect(cb.execute(() => Promise.reject(new Error("f3")))).rejects.toThrow("f3");
    await expect(cb.execute(() => Promise.reject(new Error("f4")))).rejects.toThrow("f4");
    expect(cb.getState()).toBe("closed");

    // One more within window -- now 3 in window, should open
    await expect(cb.execute(() => Promise.reject(new Error("f5")))).rejects.toThrow("f5");
    expect(cb.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("successful half-open probe clears failure timestamps", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 50, windowMs: 60_000 });

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 60));

    // Successful probe resets to closed with clean slate
    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");

    // After reset, need full threshold failures to trip again
    await expect(cb.execute(() => Promise.reject(new Error("f1")))).rejects.toThrow("f1");
    await expect(cb.execute(() => Promise.reject(new Error("f2")))).rejects.toThrow("f2");
    expect(cb.getState()).toBe("closed"); // only 2 of 3
  });
});
