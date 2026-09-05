import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBootstrap } from "../bootstrap.js";

// ── Bootstrap placeholder guard ────────────────────────────────────
//
// The guard short-circuits when VITEST is set, so a test that leaves the
// variable in place asserts nothing about the check. Every case that
// exercises the check clears it first and stubs `process.exit`, which the
// guard calls on a hit.

describe("bootstrap placeholder guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const stubExit = () => vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

  it("skips the check under the test runner", () => {
    const exit = stubExit();
    vi.stubEnv("npm_package_name", "__PROJECT_NAME__");

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });

  it("exits when a package field still holds an unresolved placeholder", () => {
    const exit = stubExit();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", "__PROJECT_NAME__");
    vi.stubEnv("npm_package_description", "A webhook module");

    validateBootstrap();

    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls[0]![0]).toContain("__PROJECT_NAME__");
  });

  it("passes when every package field is resolved", () => {
    const exit = stubExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", "orders-webhooks");
    vi.stubEnv("npm_package_description", "A webhook module");

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });

  it("passes when a package field is absent", () => {
    const exit = stubExit();
    vi.stubEnv("VITEST", "");
    vi.stubEnv("npm_package_name", undefined);
    vi.stubEnv("npm_package_description", undefined);

    validateBootstrap();

    expect(exit).not.toHaveBeenCalled();
  });
});
