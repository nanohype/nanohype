import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { loadConfig } from "../../config.js";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  parseTimeoutMs,
  RequestTimeoutError,
  withRequestTimeout,
} from "../request-timeout.js";

// ── Request Timeout Tests ───────────────────────────────────────────
//
// A timeout setting takes a whole number of milliseconds written in
// digits, from 1 to the longest delay a Node.js timer holds, and the
// default when unset or empty. Every template that reads
// LLM_REQUEST_TIMEOUT_MS holds its parse to this same table; here the
// configuration reads it, so a value the parse refuses fails loadConfig()
// rather than the first request.
//

const REFUSAL = (value: string) =>
  `LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`;

const ACCEPTED: [string | undefined, number][] = [
  [undefined, DEFAULT_REQUEST_TIMEOUT_MS],
  ["", DEFAULT_REQUEST_TIMEOUT_MS],
  ["1", 1],
  ["5000", 5_000],
  ["120000", 120_000],
  ["2147483647", 2_147_483_647],
];

const REFUSED = [
  "0",
  "-1",
  "1.5",
  "NaN",
  "30s",
  " ",
  " 5000",
  "5000 ",
  "1e3",
  "0x10",
  "+5",
  "2147483648",
  "Infinity",
];

describe("parseTimeoutMs", () => {
  it("defaults to 120000 ms", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(120_000);
  });

  it.each(ACCEPTED)("reads %o as %s ms", (value, ms) => {
    expect(parseTimeoutMs("LLM_REQUEST_TIMEOUT_MS", value, DEFAULT_REQUEST_TIMEOUT_MS)).toBe(ms);
  });

  it.each(REFUSED)("refuses %o", (value) => {
    expect(() =>
      parseTimeoutMs("LLM_REQUEST_TIMEOUT_MS", value, DEFAULT_REQUEST_TIMEOUT_MS),
    ).toThrow(REFUSAL(value));
  });
});

describe("LLM_REQUEST_TIMEOUT_MS in the configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(ACCEPTED)("reads %o as %s ms", (value, ms) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);

    expect(loadConfig().requestTimeoutMs).toBe(ms);
  });

  it.each(REFUSED)("refuses %o as the configuration loads", (value) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);

    let refused: unknown;
    try {
      loadConfig();
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(ZodError);
    expect((refused as ZodError).issues).toEqual([
      expect.objectContaining({ path: ["requestTimeoutMs"], message: REFUSAL(value) }),
    ]);
  });
});

describe("withRequestTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns what the call returns and clears its timer", async () => {
    vi.useFakeTimers();

    await expect(withRequestTimeout(1_000, async () => "reply")).resolves.toBe("reply");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects at the timeout and aborts the call's signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const outcome = withRequestTimeout(1_000, (s) => {
      signal = s;
      return new Promise<never>(() => {});
    });
    const settled = vi.fn();
    outcome.catch(settled);

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).not.toHaveBeenCalled();
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = settled.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error).toMatchObject({
      timeoutMs: 1_000,
      message: "No answer from the model within 1000 ms",
    });
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(error);
  });
});
