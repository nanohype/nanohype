/**
 * The eval corpus loader.
 *
 * What it does with nothing is the point: an eval that finds no cases and
 * exits 0 reports the same result as an eval that ran the whole corpus and
 * passed, so a reader cannot tell the two apart.
 *
 * Temp directories rather than fixtures on a fixed path, and no provider — the
 * loader is the part of the eval that runs without credentials, and the run it
 * protects is the one nobody watches.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversBothKinds, EmptyCorpusError, loadCases, splitInput } from "../eval/cases.js";

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
  input: "clip.wav\n\nTranscript: hello",
  assertions: [{ type: "modality", value: "audio" }],
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

  it("refuses a case with no kind, so adversarial coverage cannot be assumed", async () => {
    const { kind: _dropped, ...withoutKind } = aCase();
    await writeFile(join(dir, "one.json"), JSON.stringify(withoutKind), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/golden\|adversarial/);
  });

  it("refuses a case of the wrong shape rather than skipping it", async () => {
    // A case skipped in silence is a case that stopped running with nothing
    // saying so.
    await writeFile(join(dir, "one.json"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a case file that is not JSON, naming the file", async () => {
    // Skipping what will not parse drops a case as quietly as skipping one
    // whose shape is wrong, and the error is worth nothing without the name of
    // the file to open.
    await writeFile(join(dir, "one.json"), "{ not json at all", "utf-8");
    await writeFile(join(dir, "two.json"), JSON.stringify(aCase()), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/one\.json is not JSON/);
  });

  it("loads the corpus this project ships", async () => {
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    expect(shipped.length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });

  it("ships a corpus whose inputs all name a source the pipeline can route", async () => {
    // The first line of an input is the filename the pipeline routes on. A
    // case whose input has no filename runs against whatever modality the
    // runner falls back to, which is not the modality the case is about.
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    for (const one of shipped) {
      expect(splitInput(one.input).source).toMatch(/\.[a-z0-9]+$/i);
    }
  });
});

describe("splitInput", () => {
  it("takes the source from the first line and the content from the rest", () => {
    expect(splitInput("clip.wav\n\nTranscript: two words")).toEqual({
      source: "clip.wav",
      content: "Transcript: two words",
    });
  });

  it("reads a single line as a source with no extracted content", () => {
    expect(splitInput("clip.wav")).toEqual({ source: "clip.wav", content: "" });
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
