import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversBothKinds, EmptyCorpusError, loadCases } from "../eval/cases.js";

/**
 * The corpus loader. What it does with nothing is the point: an eval that
 * finds no cases and exits 0 reports the same result as an eval that ran the
 * whole corpus and passed, so a reader cannot tell the two apart.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wiki-eval-cases-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const aCase = (over: Record<string, unknown> = {}) => ({
  name: "a case",
  kind: "golden",
  input: "How long is the rollback window?",
  assertions: [{ type: "contains", value: "30 minutes" }],
  ...over,
});

describe("loadCases", () => {
  it("refuses an empty directory rather than returning an empty corpus", async () => {
    await expect(loadCases(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("says where a case goes and what one holds, so the refusal is actionable", async () => {
    await expect(loadCases(dir)).rejects.toThrow(/Add a \.json file there holding a name/);
  });

  it("refuses a directory that does not exist", async () => {
    await expect(loadCases(join(dir, "absent"))).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory holding no case files", async () => {
    await writeFile(join(dir, "README.md"), "not a case", "utf-8");

    await expect(loadCases(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("loads the cases it finds", async () => {
    await writeFile(join(dir, "one.json"), JSON.stringify(aCase()), "utf-8");
    await writeFile(
      join(dir, "two.json"),
      JSON.stringify(aCase({ name: "another", kind: "adversarial" })),
      "utf-8",
    );

    const cases = await loadCases(dir);

    expect(cases.map((c) => c.name).sort()).toEqual(["a case", "another"]);
  });

  it("refuses a case with no assertions, which would pass having checked nothing", async () => {
    await writeFile(join(dir, "one.json"), JSON.stringify(aCase({ assertions: [] })), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/at least one assertion/);
  });

  it("refuses an assertion with no type, which no runner could apply", async () => {
    await writeFile(
      join(dir, "one.json"),
      JSON.stringify(aCase({ assertions: [{ value: "30 minutes" }] })),
      "utf-8",
    );

    await expect(loadCases(dir)).rejects.toThrow(/at least one assertion/);
  });

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await writeFile(join(dir, "one.json"), JSON.stringify(withoutKind), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/golden\|adversarial/);
  });

  it("refuses a malformed case rather than skipping it", async () => {
    // A case skipped in silence is a case that stopped running with nothing
    // saying so.
    await writeFile(join(dir, "one.json"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a case file that is not JSON, naming the file that failed", async () => {
    // Unparseable is the other way a case stops running: a parse guarded by a
    // skip drops the file, and the corpus around it still reports a pass.
    await writeFile(join(dir, "broken.json"), "{ not json at all", "utf-8");
    await writeFile(join(dir, "two.json"), JSON.stringify(aCase()), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/broken\.json is not JSON/);
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
