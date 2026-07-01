import { describe, it, expect, vi } from "vitest";
import { createCircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";

/** Synchronous fake clock — the breaker reads time only through `now()`. */
function makeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    tick: (ms: number) => {
      t += ms;
    },
  };
}

const fail = () => Promise.reject(new Error("boom"));
const ok = () => Promise.resolve("ok");

const baseConfig = { name: "test", failureThreshold: 3, windowMs: 60_000, halfOpenAfterMs: 30_000 };

describe("circuit breaker", () => {
  it("passes results through while closed", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, now: clock.now });

    await expect(cb.exec(ok)).resolves.toBe("ok");
    expect(cb.state()).toBe("closed");
  });

  it("opens after failureThreshold failures within the window", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, now: clock.now });

    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("boom");
    }
    expect(cb.state()).toBe("open");
  });

  it("fast-fails with CircuitOpenError while open, without invoking the function", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");

    const probe = vi.fn(ok);
    await expect(cb.exec(probe)).rejects.toBeInstanceOf(CircuitOpenError);
    await expect(cb.exec(probe)).rejects.toThrow("circuit open: test");
    expect(probe).not.toHaveBeenCalled();
  });

  it("decays failures that age out of the sliding window", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("closed");

    // Age the first two failures out of the window.
    clock.tick(61_000);

    // Two more failures — only 2 in the current window, still under threshold.
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("closed");

    // Third within the window trips it.
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");
  });

  it("allows a half-open probe after the cooldown; success closes and clears the window", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");

    clock.tick(30_000);
    await expect(cb.exec(ok)).resolves.toBe("ok");
    expect(cb.state()).toBe("closed");

    // Window was cleared — a single new failure trips again only because
    // threshold is 1; with a higher threshold the slate is clean.
    const cb2 = createCircuitBreaker({ ...baseConfig, now: clock.now });
    for (let i = 0; i < 3; i++) await expect(cb2.exec(fail)).rejects.toThrow("boom");
    clock.tick(30_000);
    await expect(cb2.exec(ok)).resolves.toBe("ok");
    await expect(cb2.exec(fail)).rejects.toThrow("boom");
    await expect(cb2.exec(fail)).rejects.toThrow("boom");
    expect(cb2.state()).toBe("closed"); // 2 of 3 — clean slate after recovery
  });

  it("re-opens with a fresh openedAt when the probe fails", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    clock.tick(30_000);

    // Probe fails — straight back to open.
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");

    // The cooldown restarted: half the cooldown later it is still open.
    clock.tick(15_000);
    await expect(cb.exec(ok)).rejects.toBeInstanceOf(CircuitOpenError);

    // Full cooldown elapsed — probe allowed again.
    clock.tick(15_000);
    await expect(cb.exec(ok)).resolves.toBe("ok");
    expect(cb.state()).toBe("closed");
  });

  it("rejects concurrent calls while a half-open probe is in flight", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    clock.tick(30_000);

    let release!: (v: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });

    const probe = cb.exec(() => gate);
    await expect(cb.exec(ok)).rejects.toBeInstanceOf(CircuitOpenError);

    release("recovered");
    await expect(probe).resolves.toBe("recovered");
    expect(cb.state()).toBe("closed");
  });

  it("fires onOpen exactly once per closed→open transition", async () => {
    const clock = makeClock();
    const onOpen = vi.fn();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now, onOpen });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("test");

    // Rejections while already open do not re-fire.
    await expect(cb.exec(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    await expect(cb.exec(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(onOpen).toHaveBeenCalledTimes(1);

    // A failed probe is a fresh trip.
    clock.tick(30_000);
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("reset() force-closes and clears failure history", async () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ ...baseConfig, failureThreshold: 1, now: clock.now });

    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");

    cb.reset();
    expect(cb.state()).toBe("closed");
    await expect(cb.exec(ok)).resolves.toBe("ok");
  });

  it("defaults to Date.now when no clock is injected", async () => {
    const cb = createCircuitBreaker({ name: "wall-clock", failureThreshold: 1, windowMs: 60_000, halfOpenAfterMs: 30_000 });
    await expect(cb.exec(fail)).rejects.toThrow("boom");
    expect(cb.state()).toBe("open");
  });
});
