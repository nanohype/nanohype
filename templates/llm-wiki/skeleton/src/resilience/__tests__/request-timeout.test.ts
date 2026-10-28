import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { getConfig, resetConfig } from "../../config.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, parseTimeoutMs } from "../request-timeout.js";

/**
 * Tests for the LLM_REQUEST_TIMEOUT_MS setting.
 *
 * A timeout setting takes a whole number of milliseconds written in digits,
 * from 1 to the longest delay a Node.js timer holds, and the default when
 * unset or empty. Every template that reads LLM_REQUEST_TIMEOUT_MS holds its
 * parse to this same table; here the configuration reads it, so a value the
 * parse refuses fails getConfig() before any request.
 */

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
    resetConfig();
  });

  it.each(ACCEPTED)("reads %o as %s ms", (value, ms) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);
    resetConfig();

    expect(getConfig().LLM_REQUEST_TIMEOUT_MS).toBe(ms);
  });

  it.each(REFUSED)("refuses %o as the configuration loads", (value) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", value);
    resetConfig();

    let refused: unknown;
    try {
      getConfig();
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(ZodError);
    expect((refused as ZodError).issues).toEqual([
      expect.objectContaining({ path: ["LLM_REQUEST_TIMEOUT_MS"], message: REFUSAL(value) }),
    ]);
  });
});
