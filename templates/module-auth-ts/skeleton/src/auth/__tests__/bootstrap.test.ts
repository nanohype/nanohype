import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBootstrap } from "../bootstrap.js";

// ── Helpers ─────────────────────────────────────────────────────────

// The scaffolding renderer substitutes declared placeholders in skeleton
// file content, so the sample token is assembled from parts and never
// appears in this file as a single token run.
const MARK = "__";
const UNRESOLVED = `${MARK}SAMPLE_NAME${MARK}`;

/**
 * Silence the diagnostic and neutralise the exit so the whole check runs
 * inside the test process.
 */
function captureExit() {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return { exit, error };
}

describe("validateBootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips the check under the test runner", () => {
    const { exit } = captureExit();
    vi.stubEnv("npm_package_name", UNRESOLVED);

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });

  it("passes when package metadata carries no placeholder", () => {
    const { exit } = captureExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", "billing-auth");
    vi.stubEnv("npm_package_description", "Auth middleware for billing");

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });

  it("passes when package metadata is absent", () => {
    const { exit } = captureExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", "");
    vi.stubEnv("npm_package_description", "");

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });

  it("exits naming the package name when its placeholder is unresolved", () => {
    const { exit, error } = captureExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", UNRESOLVED);
    vi.stubEnv("npm_package_description", "Auth middleware for billing");

    validateBootstrap();

    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![0])).toContain("package name");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits naming the package description when its placeholder is unresolved", () => {
    const { exit, error } = captureExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", "billing-auth");
    vi.stubEnv("npm_package_description", UNRESOLVED);

    validateBootstrap();

    expect(String(error.mock.calls[0]![0])).toContain("package description");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("module entry", () => {
  it("runs the bootstrap check and re-exports the public surface", async () => {
    // The entry is a barrel with one statement that runs: importing it is what
    // makes the check happen, so importing it is what covers the check.
    const entry = await import("../index.js");

    for (const name of [
      "requireAuth",
      "requireRole",
      "createAuthMiddleware",
      "getAuthResult",
      "getAuthUser",
      "getProvider",
      "listProviders",
      "registerProvider",
    ]) {
      expect(entry).toHaveProperty(name);
    }
  });
});
