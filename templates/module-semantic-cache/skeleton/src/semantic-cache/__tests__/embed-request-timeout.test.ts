import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EMBED_REQUEST_TIMEOUT_MS, parseTimeoutMs } from "../embedder/request-timeout.js";

// EMBED_REQUEST_TIMEOUT_MS bounds every embedding call. An empty value is
// unset, and anything but a whole number of milliseconds a Node.js timer
// holds fails the import: Number() would read "" as 0, which aborts every
// call at once, and "30s" as NaN, which AbortSignal.timeout() refuses.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseTimeoutMs", () => {
  it("reads a whole number of milliseconds, and the fallback when unset or empty", () => {
    expect(parseTimeoutMs("T", "1234", 7)).toBe(1234);
    expect(parseTimeoutMs("T", "2147483647", 7)).toBe(2_147_483_647);
    expect(parseTimeoutMs("T", undefined, 7)).toBe(7);
    expect(parseTimeoutMs("T", "", 7)).toBe(7);
  });

  it.each(["0", "-1", "1.5", "30s", " 100", "1e3", "2147483648"])("refuses %j", (value) => {
    expect(() => parseTimeoutMs("T", value, 7)).toThrow(
      `T must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`,
    );
  });
});

describe("EMBED_REQUEST_TIMEOUT_MS", () => {
  it("is 30000 when unset or empty, and the value it names otherwise", async () => {
    vi.stubEnv("EMBED_REQUEST_TIMEOUT_MS", "");
    vi.resetModules();
    expect((await import("../embedder/request-timeout.js")).EMBED_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_EMBED_REQUEST_TIMEOUT_MS).toBe(30_000);

    vi.stubEnv("EMBED_REQUEST_TIMEOUT_MS", "4500");
    vi.resetModules();
    expect((await import("../embedder/request-timeout.js")).EMBED_REQUEST_TIMEOUT_MS).toBe(4500);
  });

  it("fails the import of every embedding provider on a value it refuses", async () => {
    vi.stubEnv("EMBED_REQUEST_TIMEOUT_MS", "30s");
    vi.resetModules();

    await expect(import("../embedder/gateway.js")).rejects.toThrow(
      'EMBED_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "30s"',
    );
  });
});
