import { describe, expect, it } from "vitest";
import { readRequestTimeoutMs } from "../config.js";

// LLM_REQUEST_TIMEOUT_MS bounds every LLM call, read by loadConfig() and by
// each provider as its module loads, through one schema. An empty value is
// unset, and anything but a whole number of milliseconds a Node.js timer
// holds is refused: Number() would read "" as 0, which aborts every call at
// once, and "30s" as NaN, which AbortSignal.timeout() refuses.

describe("LLM_REQUEST_TIMEOUT_MS", () => {
  it("reads a whole number of milliseconds, and 30000 when unset or empty", () => {
    expect(readRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "1234" })).toBe(1234);
    expect(readRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "2147483647" })).toBe(2_147_483_647);
    expect(readRequestTimeoutMs({})).toBe(30_000);
    expect(readRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: "" })).toBe(30_000);
  });

  it.each(["0", "-1", "1.5", "30s", " 100", "1e3", "2147483648"])("refuses %j", (value) => {
    expect(() => readRequestTimeoutMs({ LLM_REQUEST_TIMEOUT_MS: value })).toThrow(
      `LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`,
    );
  });
});
