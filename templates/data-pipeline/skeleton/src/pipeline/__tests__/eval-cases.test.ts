/**
 * The eval corpus loader. What it does with nothing is the point: an eval
 * that finds no cases and exits 0 reports the same result as an eval that ran
 * the whole corpus and passed, so a reader cannot tell the two apart.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversBothKinds, EmptyCorpusError, loadCases } from "../eval/cases.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-cases-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const aCase = (over: Record<string, unknown> = {}) => ({
  name: "a case",
  kind: "golden",
  input: "a document with something in it",
  assertions: [{ type: "text_preserved", value: "document" }],
  ...over,
});

const write = (file: string, body: unknown) =>
  writeFile(join(dir, file), JSON.stringify(body), "utf-8");

describe("loadCases", () => {
  it("refuses an empty directory rather than returning an empty corpus", async () => {
    await expect(loadCases(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory that does not exist", async () => {
    await expect(loadCases(join(dir, "absent"))).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory holding no case files", async () => {
    await writeFile(join(dir, "README.md"), "not a case", "utf-8");

    await expect(loadCases(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("loads the cases it finds", async () => {
    await write("one.json", aCase());
    await write("two.json", aCase({ name: "another", kind: "adversarial" }));

    const cases = await loadCases(dir);

    expect(cases.map((c) => c.name).sort()).toEqual(["a case", "another"]);
  });

  it("refuses a case with no assertions, which would pass having checked nothing", async () => {
    await write("one.json", aCase({ assertions: [] }));

    await expect(loadCases(dir)).rejects.toThrow(/at least one assertion/);
  });

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await write("one.json", withoutKind);

    await expect(loadCases(dir)).rejects.toThrow(/golden\|adversarial/);
  });

  it("refuses a malformed case rather than skipping it", async () => {
    // A case skipped in silence is a case that stopped running with nothing
    // saying so.
    await write("one.json", { nonsense: true });

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a file that is not JSON, naming it", async () => {
    // Skipping what does not parse is the same silence as skipping what parses
    // to the wrong shape, and the file name is what makes the refusal fixable.
    await writeFile(join(dir, "broken.json"), "{ not json at all", "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(
      /broken\.json is not an eval case: it is not JSON/,
    );
  });

  it("refuses an assertion no runner assertion implements", async () => {
    await write("one.json", aCase({ assertions: [{ type: "vibes", value: "good" }] }));

    await expect(loadCases(dir)).rejects.toThrow(/no runner assertion implements/);
  });

  it("refuses an assertion whose value the check cannot read", async () => {
    await write("one.json", aCase({ assertions: [{ type: "chunk_count_between", value: 3 }] }));

    await expect(loadCases(dir)).rejects.toThrow(/cannot be checked against/);
  });

  it("loads the corpus this project ships", async () => {
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    expect(shipped.length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });
});

describe("coversBothKinds", () => {
  it("is false for a corpus of golden cases only", () => {
    expect(coversBothKinds([aCase() as never])).toBe(false);
  });

  it("is false for a corpus of adversarial cases only", () => {
    expect(coversBothKinds([aCase({ kind: "adversarial" }) as never])).toBe(false);
  });

  it("is true once both kinds are present", () => {
    expect(coversBothKinds([aCase(), aCase({ kind: "adversarial" })] as never)).toBe(true);
  });
});
