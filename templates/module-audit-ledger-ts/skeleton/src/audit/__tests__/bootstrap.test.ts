import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBootstrap } from "../bootstrap.js";

// Assembled at run time. A literal token here would be substituted when the
// template is rendered, and the rendered project would test nothing.
const unresolved = `__${"PACKAGE"}_NAME__`;

function spyOnExit() {
  return vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
}

describe("validateBootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips the check under the test runner, which sees the unrendered skeleton", () => {
    const exit = spyOnExit();
    vi.stubEnv("npm_package_name", unresolved);
    validateBootstrap();
    expect(exit).not.toHaveBeenCalled();
  });

  it("passes when the package metadata is resolved", () => {
    const exit = spyOnExit();
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("npm_package_name", "audit-ledger");
    vi.stubEnv("npm_package_description", "Append-only audit ledger");
    validateBootstrap();
    expect(exit).not.toHaveBeenCalled();
  });

  it("passes when the package metadata is absent", () => {
    const exit = spyOnExit();
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("npm_package_name", undefined);
    vi.stubEnv("npm_package_description", undefined);
    validateBootstrap();
    expect(exit).not.toHaveBeenCalled();
  });

  it("names the unresolved value and exits non-zero", () => {
    const exit = spyOnExit();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VITEST", undefined);
    vi.stubEnv("npm_package_name", unresolved);
    vi.stubEnv("npm_package_description", "Append-only audit ledger");

    validateBootstrap();

    expect(error).toHaveBeenCalledWith(expect.stringContaining(unresolved));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("package name"));
    expect(exit).toHaveBeenCalledWith(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
