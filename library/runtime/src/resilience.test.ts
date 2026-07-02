import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout, withRetry, TimeoutError } from "./resilience.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves when the promise settles before the deadline", async () => {
    await expect(withTimeout(Promise.resolve(42), 1_000)).resolves.toBe(42);
  });

  it("propagates the underlying rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });

  it("rejects with TimeoutError when the deadline wins", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});

    const result = withTimeout(never, 50, "slack.pin");
    const assertion = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
      message: "slack.pin timed out after 50ms",
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("labels the error with a default when no label is given", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});

    const result = withTimeout(never, 10);
    const assertion = expect(result).rejects.toThrow("operation timed out after 10ms");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it("clears the timer when the promise settles first", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve("ok"), 5_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("withRetry", () => {
  /** Records requested delays instead of sleeping. */
  function makeSleepRecorder() {
    const delays: number[] = [];
    return { delays, sleep: (ms: number) => (delays.push(ms), Promise.resolve()) };
  }

  it("returns the first successful result without sleeping", async () => {
    const { delays, sleep } = makeSleepRecorder();
    const factory = vi.fn(async () => "ok");

    await expect(withRetry(factory, { attempts: 3, initialDelayMs: 100, jitter: false, sleep })).resolves.toBe("ok");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("retries with exponential backoff until success", async () => {
    const { delays, sleep } = makeSleepRecorder();
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce("third time lucky");

    await expect(withRetry(factory, { attempts: 3, initialDelayMs: 100, jitter: false, sleep })).resolves.toBe(
      "third time lucky",
    );
    expect(factory).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it("caps the backoff at maxDelayMs", async () => {
    const { delays, sleep } = makeSleepRecorder();
    const factory = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(
      withRetry(factory, { attempts: 5, initialDelayMs: 100, maxDelayMs: 250, jitter: false, sleep }),
    ).rejects.toThrow("always");
    expect(delays).toEqual([100, 200, 250, 250]);
  });

  it("throws the last error on exhaustion", async () => {
    const { sleep } = makeSleepRecorder();
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("last"));

    await expect(withRetry(factory, { attempts: 2, initialDelayMs: 10, jitter: false, sleep })).rejects.toThrow(
      "last",
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("jitters each delay to 50-100% of the computed backoff", async () => {
    const { delays, sleep } = makeSleepRecorder();
    const factory = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(
      withRetry(factory, { attempts: 4, initialDelayMs: 100, maxDelayMs: 5_000, jitter: true, sleep }),
    ).rejects.toThrow("always");

    expect(delays).toHaveLength(3);
    const bases = [100, 200, 400];
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(bases[i] * 0.5);
      expect(delay).toBeLessThanOrEqual(bases[i]);
    });
  });
});
