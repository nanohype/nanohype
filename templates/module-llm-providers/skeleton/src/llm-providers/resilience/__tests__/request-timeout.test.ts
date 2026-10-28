import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRequestTimeoutMs } from "../request-timeout.js";

// ── Request Timeout Tests ──────────────────────────────────────────
//
// LLM_REQUEST_TIMEOUT_MS bounds every call of the providers that read it.
// These hold the parse to its default and its refusals, and the providers
// to reading it as their modules load, so a value it refuses stops the
// process at startup rather than at the first request.
//

describe("LLM_REQUEST_TIMEOUT_MS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, 30_000],
    ["", 30_000],
    ["5000", 5_000],
  ])("reads %o as %s ms", (value, ms) => {
    expect(parseRequestTimeoutMs(value)).toBe(ms);
  });

  it.each(["0", "-1", "1.5", "30s", " "])("refuses %o", (value) => {
    expect(() => parseRequestTimeoutMs(value)).toThrow(
      `LLM_REQUEST_TIMEOUT_MS must be a positive whole number of milliseconds, got "${value}"`,
    );
  });

  it("fails the anthropic provider's import on a value it refuses", async () => {
    vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "30s");
    vi.resetModules();

    await expect(import("../../providers/anthropic.js")).rejects.toThrow(
      'LLM_REQUEST_TIMEOUT_MS must be a positive whole number of milliseconds, got "30s"',
    );
  });
});
