import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { EvalCase, type EvalCaseConfig } from "../case.js";
import { allCases, coversBothKinds, EmptyCorpusError, loadCorpus } from "../corpus.js";
import { EvalSuite } from "../suite.js";

/**
 * Corpus discovery. What it does with nothing is the point: a run that finds
 * no case and exits 0 reports the same result as a run that executed the whole
 * corpus and passed, so a reader cannot tell the two apart.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-corpus-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const aCase = (over: Record<string, unknown> = {}) => ({
  name: "a case",
  kind: "golden",
  input: "hello",
  assertions: [{ type: "contains", value: "hi" }],
  ...over,
});

const writeSuite = (file: string, body: unknown): Promise<void> =>
  writeFile(join(dir, file), stringifyYaml(body), "utf-8");

const globIn = (base = dir): string => join(base, "*.yaml");

describe("loadCorpus", () => {
  it("refuses a glob that matches no suite file", async () => {
    await expect(loadCorpus(globIn())).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory that does not exist", async () => {
    await expect(loadCorpus(globIn(join(dir, "absent")))).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses suite files that declare no cases between them", async () => {
    await writeSuite("empty.yaml", { name: "empty", cases: [] });

    await expect(loadCorpus(globIn())).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("loads the cases it finds, across every matching suite", async () => {
    await writeSuite("one.yaml", { name: "one", cases: [aCase()] });
    await writeSuite("two.yaml", {
      name: "two",
      cases: [aCase({ name: "another", kind: "adversarial" })],
    });

    const suites = await loadCorpus(globIn());

    expect(suites.map((s) => s.name)).toEqual(["one", "two"]);
    expect(allCases(suites).map((c) => c.name)).toEqual(["a case", "another"]);
  });

  it("refuses a case with no assertions, which would pass having checked nothing", async () => {
    await writeSuite("one.yaml", { name: "one", cases: [aCase({ assertions: [] })] });

    await expect(loadCorpus(globIn())).rejects.toThrow(/assertions/);
  });

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await writeSuite("one.yaml", { name: "one", cases: [withoutKind] });

    await expect(loadCorpus(globIn())).rejects.toThrow(/kind/);
  });

  it("refuses a malformed suite file rather than skipping it", async () => {
    // A suite skipped in silence is a suite that stops running with nothing
    // saying so.
    await writeSuite("one.yaml", { nonsense: true });

    await expect(loadCorpus(globIn())).rejects.toThrow(/is not an eval suite/);
  });

  it("loads the corpus this project ships", async () => {
    const shipped = await loadCorpus(resolve(import.meta.dirname, "..", "..", "suites", "*.yaml"));

    expect(allCases(shipped).length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });
});

describe("coversBothKinds", () => {
  const suiteOf = (...configs: EvalCaseConfig[]) =>
    new EvalSuite(
      "a suite",
      configs.map((c) => new EvalCase(c)),
    );

  it("is false for a corpus of golden cases only", () => {
    expect(coversBothKinds([suiteOf(aCase() as EvalCaseConfig)])).toBe(false);
  });

  it("is false for a corpus of adversarial cases only", () => {
    expect(coversBothKinds([suiteOf(aCase({ kind: "adversarial" }) as EvalCaseConfig)])).toBe(
      false,
    );
  });

  it("is true once both kinds are present, across separate suites", () => {
    const golden = suiteOf(aCase() as EvalCaseConfig);
    const adversarial = suiteOf(aCase({ kind: "adversarial" }) as EvalCaseConfig);

    expect(coversBothKinds([golden, adversarial])).toBe(true);
  });
});
