import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoadedSuite } from "../ci-eval/cases.js";
import { coversBothKinds, EmptyCorpusError, loadSuites } from "../ci-eval/cases.js";

// ── Corpus loader tests ───────────────────────────────────────────
//
// What the loader does with nothing is the point. A gate that finds no
// cases and exits 0 reports what a gate that ran the whole corpus and
// passed reports, and the reviewer reading the green check cannot tell
// the two apart — so every way of ending up with nothing to run is
// pinned here as a refusal.
//
// YAML is a superset of JSON, so the fixtures are written as JSON: the
// shape under test is the schema, not the quoting.

const aCase = (over: Record<string, unknown> = {}) => ({
  name: "a case",
  kind: "golden",
  input: "hello",
  assertions: [{ type: "contains", value: "hi" }],
  ...over,
});

describe("loadSuites", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ci-eval-corpus-${process.hrtime.bigint()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses an empty directory rather than returning an empty corpus", async () => {
    await expect(loadSuites(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory that does not exist", async () => {
    await expect(loadSuites(join(dir, "absent"))).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("refuses a directory holding no suite files", async () => {
    await writeFile(join(dir, "README.md"), "not a suite", "utf-8");

    await expect(loadSuites(dir)).rejects.toBeInstanceOf(EmptyCorpusError);
  });

  it("loads the suites it finds, naming a nameless one after its file", async () => {
    await writeFile(
      join(dir, "named.yaml"),
      JSON.stringify({ name: "triage", cases: [aCase()] }),
      "utf-8",
    );
    await writeFile(join(dir, "report.yml"), JSON.stringify({ cases: [aCase()] }), "utf-8");

    const suites = await loadSuites(dir);

    expect(suites.map((s) => s.name).sort()).toEqual(["report", "triage"]);
  });

  it("refuses a case with no assertions, which would pass having checked nothing", async () => {
    await writeFile(
      join(dir, "suite.yaml"),
      JSON.stringify({ cases: [aCase({ assertions: [] })] }),
      "utf-8",
    );

    await expect(loadSuites(dir)).rejects.toThrow(/needs an assertion/);
  });

  it("refuses a suite with no cases, which would score a pass over nothing", async () => {
    await writeFile(join(dir, "suite.yaml"), JSON.stringify({ cases: [] }), "utf-8");

    await expect(loadSuites(dir)).rejects.toThrow(/needs a case/);
  });

  it("refuses an assertion with no value, which compares the output against nothing", async () => {
    await writeFile(
      join(dir, "suite.yaml"),
      JSON.stringify({ cases: [aCase({ assertions: [{ type: "contains" }] })] }),
      "utf-8",
    );

    await expect(loadSuites(dir)).rejects.toThrow(/needs a value/);
  });

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await writeFile(join(dir, "suite.yaml"), JSON.stringify({ cases: [withoutKind] }), "utf-8");

    await expect(loadSuites(dir)).rejects.toThrow(/kind/);
  });

  it("refuses a malformed suite rather than skipping it", async () => {
    // A suite skipped in silence is a suite that stopped running with
    // nothing saying so.
    await writeFile(join(dir, "suite.yaml"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadSuites(dir)).rejects.toThrow(/is not an eval suite/);
  });

  it("loads the corpus this project ships", async () => {
    const shipped = await loadSuites(resolve(import.meta.dirname, "..", "..", "evals"));

    expect(shipped.length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });
});

describe("coversBothKinds", () => {
  const corpus = (...kinds: string[]): LoadedSuite[] => [
    {
      name: "s",
      path: "s.yaml",
      cases: kinds.map((kind, i) => aCase({ kind, name: `case-${i}` })),
    } as LoadedSuite,
  ];

  it("is false for a corpus of golden cases only", () => {
    expect(coversBothKinds(corpus("golden", "golden"))).toBe(false);
  });

  it("is false for a corpus of adversarial cases only", () => {
    expect(coversBothKinds(corpus("adversarial"))).toBe(false);
  });

  it("is true once both kinds are present", () => {
    expect(coversBothKinds(corpus("golden", "adversarial"))).toBe(true);
  });
});
