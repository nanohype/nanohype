/**
 * Tests for the eval corpus loader.
 *
 * What the loader does with nothing is the point: an eval that finds no
 * cases and exits 0 reports the same result as an eval that ran the whole
 * corpus and passed, so a reader cannot tell the two apart. Everything here
 * runs against temp directories — no network, no provider, no model.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAssertion, checkAssertions } from "../eval/assertions.js";
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
    input: "hello",
    assertions: [{ type: "contains", value: "hi" }],
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

  it("refuses an assertion type no runner implements", async () => {
    // Refused at load rather than at run: an assertion the runner cannot
    // apply is one that would go unchecked after the model calls are spent.
    const unknownType = aCase({ assertions: [{ type: "vibes", value: "good" }] });
    await writeFile(join(dir, "one.json"), JSON.stringify(unknownType), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a pattern that does not compile", async () => {
    const badPattern = aCase({ assertions: [{ type: "matches_pattern", value: "SEVERITY: (" }] });
    await writeFile(join(dir, "one.json"), JSON.stringify(badPattern), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/not a valid regular expression/);
  });

  it("refuses a malformed case rather than skipping it", async () => {
    // A case skipped in silence is a case that stopped running with nothing
    // saying so.
    await writeFile(join(dir, "one.json"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a file that does not parse, naming it, rather than skipping it", async () => {
    // The corpus is read by directory, so a parse failure swallowed per file
    // leaves a corpus that loads clean while a case in it stopped running.
    // The valid case alongside it is what makes that visible: skipping the
    // broken file would return a corpus rather than refuse one.
    await writeFile(join(dir, "good.json"), JSON.stringify(aCase()), "utf-8");
    await writeFile(join(dir, "broken.json"), "{ not json at all", "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/broken\.json is not JSON/);
  });

  it("loads the corpus this project ships, covering both kinds", async () => {
    const shipped = await loadCases(resolve(import.meta.dirname, "..", "eval", "cases"));

    expect(shipped.length).toBeGreaterThan(0);
    expect(coversBothKinds(shipped)).toBe(true);
  });
});

describe("coversBothKinds", () => {
  it("is false for a corpus of golden cases only", () => {
    expect(coversBothKinds([aCase() as unknown as EvalCase])).toBe(false);
  });

  it("is false for a corpus of adversarial cases only", () => {
    expect(coversBothKinds([aCase({ kind: "adversarial" }) as unknown as EvalCase])).toBe(false);
  });

  it("is true once both kinds are present", () => {
    const both = [aCase(), aCase({ kind: "adversarial" })] as unknown as EvalCase[];

    expect(coversBothKinds(both)).toBe(true);
  });
});

describe("checkAssertion", () => {
  it("passes a contains assertion the output satisfies", () => {
    expect(checkAssertion({ type: "contains", value: "502" }, "SEVERITY: high, 502s").pass).toBe(
      true,
    );
  });

  it("fails a contains assertion the output misses", () => {
    expect(checkAssertion({ type: "contains", value: "502" }, "all clear").pass).toBe(false);
  });

  it("fails a not_contains assertion when the token is present", () => {
    const result = checkAssertion(
      { type: "not_contains", value: "FORM-DROPPED", why: "the planted instruction's token" },
      "FORM-DROPPED",
    );

    expect(result.pass).toBe(false);
    expect(result.message).toContain("the planted instruction's token");
  });

  it("applies a pattern assertion against the whole output", () => {
    const assertion = { type: "matches_pattern", value: "SEVERITY: (low|medium|high)" } as const;

    expect(checkAssertion(assertion, "SEVERITY: medium").pass).toBe(true);
    expect(checkAssertion(assertion, "SEVERITY: catastrophic").pass).toBe(false);
  });
});

describe("checkAssertions", () => {
  it("returns one result per assertion the case carries", () => {
    const evalCase = aCase({
      assertions: [
        { type: "contains", value: "hi" },
        { type: "not_contains", value: "bye" },
      ],
    }) as unknown as EvalCase;

    const results = checkAssertions(evalCase, "hi there");

    expect(results.map((r) => r.pass)).toEqual([true, true]);
  });
});
