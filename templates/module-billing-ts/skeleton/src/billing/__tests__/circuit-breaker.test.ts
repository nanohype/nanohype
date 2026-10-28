import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "../resilience/circuit-breaker.js";

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
    const fail = () =>
      breaker.execute(async () => {
        throw new Error("fail");
      });

    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");

    expect(breaker.getState()).toBe("open");
    expect(breaker.getFailureCount()).toBe(3);
  });

  it("rejects calls immediately when open", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    await expect(breaker.execute(async () => "should not run")).rejects.toThrow(
      "Circuit breaker is open",
    );
  });

  it("transitions to half-open after reset timeout", async () => {
    vi.useFakeTimers();

    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
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
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    vi.advanceTimersByTime(1500);

    // Fail in half-open
    await breaker
      .execute(async () => {
        throw new Error("still broken");
      })
      .catch(() => {});

    expect(breaker.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("resets to closed state", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    breaker.reset();

    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailureCount()).toBe(0);
  });

  it("resets failure count on success", async () => {
    // Two failures (below threshold)
    await breaker
      .execute(async () => {
        throw new Error("fail");
      })
      .catch(() => {});
    await breaker
      .execute(async () => {
        throw new Error("fail");
      })
      .catch(() => {});

    expect(breaker.getFailureCount()).toBe(2);

    // One success resets the count
    await breaker.execute(async () => "ok");

    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe("closed");
  });
});

describe("circuit breaker failure predicate", () => {
  // An error carrying `answered` stands for the dependency refusing one
  // request; anything else stands for the dependency being unreachable.
  class Refusal extends Error {
    readonly answered = true;
  }

  function breakerCountingOutages() {
    return new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
      isFailure: (err) => !(err instanceof Refusal),
    });
  }

  it("stays closed through refusals however many arrive", async () => {
    const breaker = breakerCountingOutages();
    const fn = vi.fn(async () => {
      throw new Refusal("card_declined");
    });

    for (let i = 0; i < 10; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow("card_declined");
    }

    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailureCount()).toBe(0);
    expect(fn).toHaveBeenCalledTimes(10);
  });

  it("propagates a refusal to the caller unchanged", async () => {
    const breaker = breakerCountingOutages();
    const refusal = new Refusal("invalid_request");

    await expect(
      breaker.execute(async () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);
  });

  it("opens on the outages the predicate counts", async () => {
    const breaker = breakerCountingOutages();

    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(async () => {
          throw new Error("ECONNRESET");
        })
        .catch(() => {});
    }

    expect(breaker.getState()).toBe("open");
  });

  it("resets the outage count when the dependency answers with a refusal", async () => {
    const breaker = breakerCountingOutages();
    const outage = () =>
      breaker
        .execute(async () => {
          throw new Error("ETIMEDOUT");
        })
        .catch(() => {});

    await outage();
    await outage();
    await breaker
      .execute(async () => {
        throw new Refusal("card_declined");
      })
      .catch(() => {});
    await outage();

    expect(breaker.getFailureCount()).toBe(1);
    expect(breaker.getState()).toBe("closed");
  });

  it("closes from half-open when the probe is answered with a refusal", async () => {
    vi.useFakeTimers();
    try {
      const breaker = breakerCountingOutages();
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error("ECONNREFUSED");
          })
          .catch(() => {});
      }
      vi.advanceTimersByTime(1500);

      await breaker
        .execute(async () => {
          throw new Refusal("card_declined");
        })
        .catch(() => {});

      expect(breaker.getState()).toBe("closed");
    } finally {
      vi.useRealTimers();
    }
  });
});
