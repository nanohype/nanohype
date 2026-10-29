/**
 * Tests for the AUDIO_TRANSCRIPTION_TIMEOUT_MS setting.
 *
 * The transcription timeout bounds an abort signal and a timer, so it takes
 * the same parse as LLM_REQUEST_TIMEOUT_MS: a whole number of milliseconds
 * written in digits, from 1 to the longest delay a Node.js timer holds. A
 * longer one would fire after 1 ms.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { DEFAULT_TRANSCRIPTION_TIMEOUT_MS } from "../resilience/request-timeout.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AUDIO_TRANSCRIPTION_TIMEOUT_MS", () => {
  it.each([
    [undefined, DEFAULT_TRANSCRIPTION_TIMEOUT_MS],
    ["", DEFAULT_TRANSCRIPTION_TIMEOUT_MS],
    ["1", 1],
    ["60000", 60_000],
    ["2147483647", 2_147_483_647],
  ])("reads %o as %s ms", (value, ms) => {
    vi.stubEnv("AUDIO_TRANSCRIPTION_TIMEOUT_MS", value);

    expect(loadConfig().audio.transcriptionTimeoutMs).toBe(ms);
  });

  it("defaults to 900000 ms", () => {
    expect(DEFAULT_TRANSCRIPTION_TIMEOUT_MS).toBe(900_000);
  });

  it.each(["0", "1.5", "1e3", "15m", "2147483648"])("refuses %o", (value) => {
    vi.stubEnv("AUDIO_TRANSCRIPTION_TIMEOUT_MS", value);

    expect(() => loadConfig()).toThrow(
      `AUDIO_TRANSCRIPTION_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`,
    );
  });
});
