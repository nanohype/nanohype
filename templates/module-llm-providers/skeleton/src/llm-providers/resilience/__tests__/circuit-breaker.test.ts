import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCircuitBreaker,
  CircuitBreakerOpenError,
} from "../circuit-breaker.js";

// ── Circuit Breaker Tests ──────────────────────────────────────────

describe("createCircuitBreaker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in closed state", () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe("closed");
  });

  it("passes through successful calls", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(cb.getState()).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, windowMs: 10_000 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => {
        throw new Error("fail");
      })).rejects.toThrow("fail");
    }

    expect(cb.getState()).toBe("open");
  });

  it("throws CircuitBreakerOpenError when open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(async () => {
      throw new Error("fail");
    })).rejects.toThrow("fail");

    expect(cb.getState()).toBe("open");
    await expect(cb.execute(async () => "ok")).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to half-open after reset timeout", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
    });

    await expect(cb.execute(async () => {
      throw new Error("fail");
    })).rejects.toThrow("fail");

    expect(cb.getState()).toBe("open");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    // Next call should attempt (half-open)
    const result = await cb.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens on failure during half-open", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
    });

    await expect(cb.execute(async () => {
      throw new Error("fail");
    })).rejects.toThrow("fail");

    await new Promise((r) => setTimeout(r, 150));

    await expect(cb.execute(async () => {
      throw new Error("still failing");
    })).rejects.toThrow("still failing");

    expect(cb.getState()).toBe("open");
  });

  it("resets to closed state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(async () => {
      throw new Error("fail");
    })).rejects.toThrow("fail");

    expect(cb.getState()).toBe("open");
    cb.reset();
    expect(cb.getState()).toBe("closed");
  });
});
