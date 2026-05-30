import { describe, it, expect, vi } from "vitest";
import { withRetry, withTimeout, batchChunk } from "../helpers.js";

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const result = await withRetry(async () => "ok");
    expect(result).toBe("ok");
  });

  it("retries on a transient network error then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error("connection reset") as Error & { code: string };
          err.code = "ECONNRESET";
          throw err;
        }
        return "recovered";
      },
      3,
      1,
    );
    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("retries on a 5xx HTTP status", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error("server error") as Error & { status: number };
          err.status = 503;
          throw err;
        }
        return "ok";
      },
      3,
      1,
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry a non-transient error", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error("bad request");
        },
        3,
        1,
      ),
    ).rejects.toThrow("bad request");
    expect(attempts).toBe(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          const err = new Error("still down") as Error & { code: string };
          err.code = "ETIMEDOUT";
          throw err;
        },
        2,
        1,
      ),
    ).rejects.toThrow("still down");
    expect(attempts).toBe(3); // initial + 2 retries
  });

  it("treats non-object throws as non-retryable", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw "string error";
        },
        3,
        1,
      ),
    ).rejects.toBe("string error");
    expect(attempts).toBe(1);
  });
});

describe("withTimeout", () => {
  it("resolves when the operation settles in time", async () => {
    const result = await withTimeout(async () => "done", 1000, "op");
    expect(result).toBe("done");
  });

  it("passes a non-aborted signal to the operation", async () => {
    const result = await withTimeout(
      async (signal) => {
        expect(signal.aborted).toBe(false);
        return signal.aborted;
      },
      1000,
      "op",
    );
    expect(result).toBe(false);
  });

  it("rejects with a labeled timeout error when the operation is too slow", async () => {
    vi.useFakeTimers();
    const promise = withTimeout(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000)),
      50,
      "slow op",
    );
    const assertion = expect(promise).rejects.toThrow(/slow op timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });

  it("propagates the operation's own rejection", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error("inner failure");
      }, 1000, "op"),
    ).rejects.toThrow("inner failure");
  });
});

describe("batchChunk", () => {
  it("splits an array into fixed-size batches", () => {
    expect(batchChunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single batch when the array fits", () => {
    expect(batchChunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it("returns an empty array for empty input", () => {
    expect(batchChunk([], 3)).toEqual([]);
  });

  it("throws when batchSize is not positive", () => {
    expect(() => batchChunk([1, 2], 0)).toThrow("batchSize must be greater than 0");
  });
});
