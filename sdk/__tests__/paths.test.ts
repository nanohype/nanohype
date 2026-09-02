import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDescendingPath, PathContainmentError, resolveWithin } from "../src/paths.js";

describe("assertDescendingPath", () => {
  it("accepts the shapes a skeleton actually declares", () => {
    for (const path of [
      "README.md",
      "src/index.ts",
      "addons/observability/values.yaml",
      "src/__tests__/index.test.ts",
      "a..b/c",
      ".github/workflows/ci.yml",
    ]) {
      expect(() => assertDescendingPath(path, "Path")).not.toThrow();
    }
  });

  it("refuses a path that climbs out with a '..' segment", () => {
    expect(() => assertDescendingPath("../elsewhere/values.yaml", "Rendered path")).toThrow(
      PathContainmentError,
    );
    expect(() => assertDescendingPath("addons/../../out/x", "Rendered path")).toThrow(
      /'\.\.' segment/,
    );
  });

  it("refuses a '..' segment even where it would normalize back inside", () => {
    // Stricter than normalization on purpose: no skeleton path needs a `..`,
    // so one that appeared came from a substituted value.
    expect(() => assertDescendingPath("src/../index.ts", "Rendered path")).toThrow(
      PathContainmentError,
    );
  });

  it("refuses an absolute path", () => {
    expect(() => assertDescendingPath("/etc/passwd", "Rendered path")).toThrow(/is absolute/);
    expect(() => assertDescendingPath("C:\\Windows\\system32", "Rendered path")).toThrow(
      /is absolute/,
    );
    expect(() => assertDescendingPath("\\\\server\\share", "Rendered path")).toThrow(/is absolute/);
  });

  it("refuses a backslash-separated climb, since a value need not use the skeleton's separator", () => {
    expect(() => assertDescendingPath("addons\\..\\..\\out", "Rendered path")).toThrow(
      /'\.\.' segment/,
    );
  });

  it("refuses a null byte and an empty path", () => {
    expect(() => assertDescendingPath("src/index\0.ts", "Rendered path")).toThrow(/null byte/);
    expect(() => assertDescendingPath("", "Rendered path")).toThrow(/is empty/);
  });

  it("names what was refused so a caller can report which path lost", () => {
    expect(() => assertDescendingPath("../x", "Composed path for entry 'thing'")).toThrow(
      /Composed path for entry 'thing' '\.\.\/x'/,
    );
  });
});

describe("resolveWithin", () => {
  it("resolves a descending path under the base", () => {
    const base = resolve(sep, "srv", "out");
    expect(resolveWithin(base, "src/index.ts")).toBe(join(base, "src", "index.ts"));
  });

  it("returns the base itself when the segments resolve to it", () => {
    const base = resolve(sep, "srv", "out");
    expect(resolveWithin(base, ".")).toBe(base);
  });

  it("refuses segments that resolve outside the base", () => {
    const base = resolve(sep, "srv", "out");
    expect(() => resolveWithin(base, "../escape")).toThrow(/escapes/);
    expect(() => resolveWithin(base, resolve(sep, "etc", "passwd"))).toThrow(/escapes/);
  });

  it("refuses a segment carrying a null byte before it reaches a syscall", () => {
    expect(() => resolveWithin(resolve(sep, "srv"), "go-cli\0evil")).toThrow(/null byte/);
  });

  it("refuses a sibling directory sharing the base's name prefix", () => {
    // `/srv/out-evil` starts with `/srv/out` as a string but is not inside it;
    // the separator in the comparison is what makes the difference.
    const base = resolve(sep, "srv", "out");
    expect(() => resolveWithin(base, "../out-evil/x")).toThrow(/escapes/);
  });

  it("writes nothing outside the base when a real directory is the target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nanohype-paths-"));
    try {
      const outDir = join(dir, "out");
      expect(() => resolveWithin(outDir, "../sibling/values.yaml")).toThrow(/escapes/);
      // Nothing was created by the refusal itself.
      await expect(readdir(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
