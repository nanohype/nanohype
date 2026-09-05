/**
 * Tests for the eval corpus loader.
 *
 * What the loader does with nothing is the point: an eval that finds no cases
 * and exits 0 reports the same result as an eval that ran the whole corpus and
 * passed, and a reader cannot tell those two apart. Everything here runs
 * against temporary directories — no provider, no vector store, no network.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversBothKinds, EmptyCorpusError, type EvalCase, loadCases } from "../eval/cases.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-cases-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function aCase(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "a case",
    kind: "golden",
    input: "how long are logs kept?",
    assertions: [{ type: "contains", value: "180" }],
    ...over,
  };
}

describe("loadCases", () => {
  it("refuses an empty directory rather than returning an empty corpus", async () => {
    await expect(loadCases(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory that does not exist", async () => {
    await expect(loadCases(join(dir, "absent"))).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory holding no case files", async () => {
    await writeFile(join(dir, "notes.txt"), "not a case", "utf-8");

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

    expect(cases.map((c) => c.name)).toEqual(["a case", "another"]);
  });

  it("refuses a case with no assertions, which would pass having checked nothing", async () => {
    await writeFile(join(dir, "one.json"), JSON.stringify(aCase({ assertions: [] })), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/at least one assertion/);
  });

  it("refuses an assertion with no value to compare against", async () => {
    await writeFile(
      join(dir, "one.json"),
      JSON.stringify(aCase({ assertions: [{ type: "contains" }] })),
      "utf-8",
    );

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await writeFile(join(dir, "one.json"), JSON.stringify(withoutKind), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/golden\|adversarial/);
  });

  it("refuses a case file that parses to the wrong shape rather than skipping it", async () => {
    // A case skipped in silence is a case that stops running with nothing
    // saying so.
    await writeFile(join(dir, "one.json"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a case file that is not JSON, naming the file", async () => {
    // The same silence, one step earlier: a file the parser rejects is a case
    // that stops running, and the parse error alone does not say which file.
    // The readable case beside it is what a dropped file would hide behind —
    // the corpus is non-empty either way.
    await writeFile(join(dir, "one.json"), "{ not json at all", "utf-8");
    await writeFile(join(dir, "two.json"), JSON.stringify(aCase()), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/one\.json is not JSON/);
  });

  it("loads the corpus this project ships, covering both kinds", async () => {
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    expect(shipped.length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });

  it("gives every shipped adversarial assertion a reason", async () => {
    // On an adversarial case the assertion is usually a refusal, and the value
    // alone does not say what it is refusing.
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    const unexplained = shipped
      .filter((c) => c.kind === "adversarial")
      .flatMap((c) => c.assertions.filter((a) => !a.why).map((a) => `${c.name}: ${a.type}`));

    expect(unexplained).toEqual([]);
  });
});

describe("coversBothKinds", () => {
  const golden = aCase() as unknown as EvalCase;
  const adversarial = aCase({ kind: "adversarial" }) as unknown as EvalCase;

  it("is false for a corpus of golden cases only", () => {
    expect(coversBothKinds([golden])).toBe(false);
  });

  it("is false for a corpus of adversarial cases only", () => {
    expect(coversBothKinds([adversarial])).toBe(false);
  });

  it("is true once both kinds are present", () => {
    expect(coversBothKinds([golden, adversarial])).toBe(true);
  });
});
