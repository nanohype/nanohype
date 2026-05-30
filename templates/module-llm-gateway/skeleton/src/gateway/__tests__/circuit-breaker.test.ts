import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
} from "../providers/circuit-breaker.js";

// ── Circuit Breaker Tests ───────────────────────────────────────────
//
// Exercises the closed -> open -> half-open -> closed state machine,
// the failure window, the reset timeout, and fast-fail behaviour.
//

afterEach(() => {
  vi.useRealTimers();
});

const fail = () => {
  throw new Error("boom");
};

describe("circuit breaker", () => {
  it("starts closed and stays closed on success", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(cb.getState()).toBe("closed");
  });

  it("opens after the failure threshold is reached within the window", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    }

    expect(cb.getState()).toBe("open");

    // Once open, calls fast-fail without invoking the function.
    const probe = vi.fn(async () => "should not run");
    await expect(cb.execute(probe)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(probe).not.toHaveBeenCalled();
  });

  it("does not open below the threshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    }
    expect(cb.getState()).toBe("closed");
  });

  it("probes after the reset timeout and closes on a successful half-open call", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    }
    expect(cb.getState()).toBe("open");

    // Before the reset timeout elapses, still open.
    vi.advanceTimersByTime(500);
    await expect(cb.execute(async () => "x")).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    // After the reset timeout, the next call probes (half-open) and succeeds,
    // closing the breaker.
    vi.advanceTimersByTime(600);
    const result = await cb.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens when the half-open probe fails", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });

    await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(1001);
    await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");
  });

  it("reset() returns the breaker to closed", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    await expect(cb.execute(async () => fail())).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");

    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
  });
});
