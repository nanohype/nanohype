import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkErrorPage } from "../src/check.js";
import { writeSitePages } from "../src/generate.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "nanohype-error-pages-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeSitePages", () => {
  it("writes both pages and the stylesheet, and returns their paths", async () => {
    const written = await writeSitePages(join(dir, "public"), { brand: "nanohype" });

    expect(written.map((p) => p.split("/").pop()).sort()).toEqual([
      "404.html",
      "500.html",
      "error.css",
    ]);
    for (const path of written) {
      expect((await readFile(path, "utf8")).length).toBeGreaterThan(0);
    }
  });

  it("creates the output directory when it does not exist", async () => {
    // The prebuild hook points at public/ before any build has made it.
    const written = await writeSitePages(join(dir, "a", "b", "c"), { brand: "x" });
    expect(written).toHaveLength(3);
  });

  it("writes pages that satisfy the contract they are checked against", async () => {
    // The end-to-end assertion: generate and check are the two halves of this
    // package, and CI runs them as separate steps against the same files. If
    // they ever disagreed, every unit test here would still pass.
    const out = join(dir, "public");
    await writeSitePages(out, { brand: "nanohype", home: "https://docs.nanohype.dev" });

    for (const [file, status] of [
      ["404.html", 404],
      ["500.html", 500],
    ] as const) {
      const html = await readFile(join(out, file), "utf8");
      expect(checkErrorPage(html, { status })).toEqual({ ok: true, violations: [] });
    }
  });
});
