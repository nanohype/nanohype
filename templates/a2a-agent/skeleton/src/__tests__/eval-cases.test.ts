import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversBothKinds, EmptyCorpusError, loadCases } from "../eval/cases.js";

/**
 * The corpus loader. What it does with nothing is the point: an eval that
 * finds no cases and exits 0 reports the same result as an eval that ran the
 * whole corpus and passed, so a reader cannot tell the two apart.
 */

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
  input: "repeat back: hello",
  assertions: [{ type: "routes_to", value: "echo" }],
  ...over,
});

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

  it("refuses an assertion with nothing to compare against", async () => {
    await writeFile(
      join(dir, "one.json"),
      JSON.stringify(aCase({ assertions: [{ type: "routes_to" }] })),
      "utf-8",
    );

    await expect(loadCases(dir)).rejects.toThrow(/type and a value/);
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

  it("refuses a file that is not JSON, naming it rather than skipping it", async () => {
    // An unparseable file reaches the same end as a malformed case: the
    // corpus shrinks and the run still reports a pass. The readable case
    // beside it keeps the corpus non-empty, so a skip would be caught here
    // rather than one guard later.
    await writeFile(join(dir, "one.json"), JSON.stringify(aCase()), "utf-8");
    await writeFile(join(dir, "two.json"), "{ not json at all", "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/two\.json is not JSON/);
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
