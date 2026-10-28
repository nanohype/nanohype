/**
 * Tests for the LLM_REQUEST_TIMEOUT_MS setting.
 *
 * A timeout setting takes a whole number of milliseconds written in digits,
 * from 1 to the longest delay a Node.js timer holds, and the default when
 * unset or empty. Every template that reads LLM_REQUEST_TIMEOUT_MS holds its
 * parse to this same table. The providers read it as their modules load, so
 * a value the parse refuses stops the pipeline at startup rather than at the
 * first request.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REQUEST_TIMEOUT_MS, parseTimeoutMs } from "../request-timeout.js";

const REFUSAL = (value: string) =>
  `LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`;

describe("parseTimeoutMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 120000 ms", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(120_000);
  });

  it.each([
    [undefined, DEFAULT_REQUEST_TIMEOUT_MS],
    ["", DEFAULT_REQUEST_TIMEOUT_MS],
    ["1", 1],
    ["5000", 5_000],
    ["120000", 120_000],
    ["2147483647", 2_147_483_647],
  ])("reads %o as %s ms", (value, ms) => {
    expect(parseTimeoutMs("LLM_REQUEST_TIMEOUT_MS", value, DEFAULT_REQUEST_TIMEOUT_MS)).toBe(ms);
  });

  it.each([
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
  ])("refuses %o", (value) => {
    expect(() =>
      parseTimeoutMs("LLM_REQUEST_TIMEOUT_MS", value, DEFAULT_REQUEST_TIMEOUT_MS),
    ).toThrow(REFUSAL(value));
  });

  it.each([
    ["anthropic", () => import("../../providers/anthropic.js")],
    ["openai", () => import("../../providers/openai.js")],
  ])("fails the %s provider's import on a value it refuses", async (_name, load) => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "30s");
    vi.resetModules();

    await expect(load()).rejects.toThrow(REFUSAL("30s"));
  });
});
