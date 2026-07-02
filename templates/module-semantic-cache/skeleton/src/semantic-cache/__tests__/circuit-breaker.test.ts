import { describe, it, expect, vi } from "vitest";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
} from "../circuit-breaker.js";

/** A function that always rejects, for driving the breaker open. */
const fail = () => Promise.reject(new Error("boom"));
/** A function that always resolves. */
const ok = () => Promise.resolve("ok");

describe("circuit breaker", () => {
  it("passes results through while closed", async () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe("closed");
    await expect(cb.execute(ok)).resolves.toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after the failure threshold and fast-fails", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, windowMs: 60_000 });

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("closed");

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    // Now open — calls fast-fail without invoking the function.
    let invoked = false;
    await expect(
      cb.execute(async () => {
        invoked = true;
        return "x";
      }),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(invoked).toBe(false);
  });

  it("probes half-open after the reset timeout and closes on success", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5,
    });

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    // Advance past the reset window so the next call probes.
    vi.advanceTimersByTime(10);

    await expect(cb.execute(ok)).resolves.toBe("ok");
    expect(cb.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("re-opens when the half-open probe fails", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5,
    });

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    vi.advanceTimersByTime(10);

    // The probe fails — breaker goes straight back to open.
    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("reset() returns the breaker to closed", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
    await expect(cb.execute(ok)).resolves.toBe("ok");
  });

  it("decays old failures outside the sliding window", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 2, windowMs: 5 });

    await expect(cb.execute(fail)).rejects.toThrow("boom");
    // Advance so the first failure ages out of the window.
    vi.advanceTimersByTime(10);

    // A second failure alone shouldn't trip the breaker — the first decayed.
    await expect(cb.execute(fail)).rejects.toThrow("boom");
    expect(cb.getState()).toBe("closed");

    vi.useRealTimers();
  });
});
