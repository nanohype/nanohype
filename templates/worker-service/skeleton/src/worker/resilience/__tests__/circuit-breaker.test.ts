import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCircuitBreaker } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("starts in closed state", () => {
    const cb = createCircuitBreaker();
    expect(cb.state).toBe("closed");
    expect(cb.failures).toBe(0);
  });

  it("stays closed on successful calls", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.state).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    const fail = async () => {
      throw new Error("boom");
    };

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fail)).rejects.toThrow("boom");
    }

    expect(cb.state).toBe("open");
    expect(cb.failures).toBe(3);
  });

  it("rejects calls immediately when open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(cb.state).toBe("open");

    await expect(cb.call(async () => "ok")).rejects.toThrow(
      "Circuit breaker is open"
    );
  });

  it("transitions to half-open after reset timeout", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 5000,
    });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(cb.state).toBe("open");

    vi.advanceTimersByTime(5000);

    expect(cb.state).toBe("half-open");
  });

  it("closes on successful call in half-open state", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 5000,
    });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    vi.advanceTimersByTime(5000);
    expect(cb.state).toBe("half-open");

    const result = await cb.call(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.state).toBe("closed");
    expect(cb.failures).toBe(0);
  });

  it("reopens on failure in half-open state", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 5000,
    });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    vi.advanceTimersByTime(5000);
    expect(cb.state).toBe("half-open");

    await expect(
      cb.call(async () => {
        throw new Error("still broken");
      })
    ).rejects.toThrow("still broken");

    expect(cb.state).toBe("open");
  });

  it("resets failures on success in closed state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(cb.failures).toBe(1);

    await cb.call(async () => "ok");
    expect(cb.failures).toBe(0);
  });

  it("manual reset returns to closed state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(
      cb.call(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(cb.state).toBe("open");

    cb.reset();
    expect(cb.state).toBe("closed");
    expect(cb.failures).toBe(0);
  });
});
