import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlanView } from "../eval/assertions.js";
import {
  checkAssertion,
  dependenciesResolvable,
  hasDependencyEdge,
  planText,
} from "../eval/assertions.js";
import type { CaseAssertion } from "../eval/cases.js";
import { coversBothKinds, EmptyCorpusError, loadCases } from "../eval/cases.js";
import type { SubTask } from "../types.js";

/**
 * The corpus loader and the checks the runner applies to a plan. What the
 * loader does with nothing is the point: an eval that finds no cases and
 * exits 0 reports the same result as an eval that ran the whole corpus and
 * passed, so a reader cannot tell the two apart.
 *
 * Everything here runs against temp directories and plan literals — no
 * network, no provider, no key.
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
  input: "Ship the thing",
  assertions: [{ type: "min_subtasks", value: 1 }],
  ...over,
});

const subtask = (id: string, dependsOn: string[] = [], over: Partial<SubTask> = {}): SubTask => ({
  id,
  description: `do ${id}`,
  assignedAgent: "researcher",
  dependsOn,
  ...over,
});

const aPlan = (subtasks: SubTask[], reasoning = "because"): PlanView => ({ subtasks, reasoning });

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

  it("refuses an assertion the runner has no check for", async () => {
    // The runner switches on the assertion type. An unrecognized one would
    // fall through every branch and the case would pass having checked
    // nothing, which is what the case existed to prevent.
    await writeFile(
      join(dir, "one.json"),
      JSON.stringify(aCase({ assertions: [{ type: "vibes_ok", value: true }] })),
      "utf-8",
    );

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a file that parses but is not a case, rather than skipping it", async () => {
    // A case skipped in silence is a case that stopped running with nothing
    // saying so.
    await writeFile(join(dir, "one.json"), JSON.stringify({ nonsense: true }), "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/is not an eval case/);
  });

  it("refuses a file that is not JSON, naming the file", async () => {
    // The other half of the same refusal: a file the parser rejects reaches
    // the caller as a named failure, not as one case fewer in the corpus.
    await writeFile(join(dir, "one.json"), "{ not json at all", "utf-8");

    await expect(loadCases(dir)).rejects.toThrow(/one\.json is not JSON/);
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

describe("plan checks", () => {
  it("reads subtask ids, descriptions, agents and capabilities as plan text", () => {
    const text = planText(
      aPlan([subtask("subtask-1", [], { requiredCapability: "research" })], "ordered by evidence"),
    );

    expect(text).toContain("subtask-1");
    expect(text).toContain("do subtask-1");
    expect(text).toContain("researcher");
    expect(text).toContain("research");
    expect(text).toContain("ordered by evidence");
  });

  it("rejects a dependency on a subtask the plan does not contain", () => {
    const { ok, detail } = dependenciesResolvable(aPlan([subtask("subtask-2", ["subtask-1"])]));

    expect(ok).toBe(false);
    expect(detail).toMatch(/not in the plan/);
  });

  it("rejects a dependency on a subtask that comes later", () => {
    const { ok, detail } = dependenciesResolvable(
      aPlan([subtask("subtask-1", ["subtask-2"]), subtask("subtask-2")]),
    );

    expect(ok).toBe(false);
    expect(detail).toMatch(/comes later/);
  });

  it("accepts a plan whose every dependency names an earlier subtask", () => {
    expect(
      dependenciesResolvable(aPlan([subtask("subtask-1"), subtask("subtask-2", ["subtask-1"])])).ok,
    ).toBe(true);
  });

  it("sees a dependency edge only when a subtask declares one", () => {
    expect(hasDependencyEdge(aPlan([subtask("subtask-1"), subtask("subtask-2")]))).toBe(false);
    expect(hasDependencyEdge(aPlan([subtask("subtask-1", ["subtask-0"])]))).toBe(true);
  });
});

describe("checkAssertion", () => {
  const plan = aPlan(
    [subtask("subtask-1"), subtask("subtask-2", ["subtask-1"])],
    "benchmark first",
  );

  it("holds a floor on the number of subtasks", () => {
    expect(checkAssertion(plan, { type: "min_subtasks", value: 2 }).pass).toBe(true);
    expect(checkAssertion(plan, { type: "min_subtasks", value: 3 }).pass).toBe(false);
  });

  it("holds the subtask cap", () => {
    expect(checkAssertion(plan, { type: "max_subtasks", value: 2 }).pass).toBe(true);
    expect(checkAssertion(plan, { type: "max_subtasks", value: 1 }).pass).toBe(false);
  });

  it("checks for a declared ordering, in either direction", () => {
    expect(checkAssertion(plan, { type: "has_dependency_edge", value: true }).pass).toBe(true);
    expect(checkAssertion(plan, { type: "has_dependency_edge", value: false }).pass).toBe(false);
  });

  it("fails a plan whose edges point outside it", () => {
    const dangling = aPlan([subtask("subtask-9", ["subtask-4"])]);

    expect(checkAssertion(dangling, { type: "dependencies_resolvable", value: true }).pass).toBe(
      false,
    );
  });

  it("matches plan text without regard to case", () => {
    expect(checkAssertion(plan, { type: "plan_contains", value: "BENCHMARK" }).pass).toBe(true);
    expect(checkAssertion(plan, { type: "plan_not_contains", value: "BENCHMARK" }).pass).toBe(
      false,
    );
    expect(checkAssertion(plan, { type: "plan_not_contains", value: "override" }).pass).toBe(true);
  });

  it("reports why a failing assertion mattered, and does not pad a passing one", () => {
    const why = "the recommendation cannot precede the measurement";

    expect(checkAssertion(plan, { type: "min_subtasks", value: 5, why }).message).toContain(why);
    expect(checkAssertion(plan, { type: "min_subtasks", value: 1, why }).message).not.toContain(
      why,
    );
  });
});

describe("checkAssertion on a type nothing implements", () => {
  // A case file is JSON, so the assertion union constrains what the loader
  // accepts and nothing else. A type outside it reaches the checks, and a
  // switch that ignores it produces no result — `every` over an empty list is
  // true, so the case is reported green having checked nothing.
  it("fails rather than falling through", () => {
    const result = checkAssertion(aPlan([subtask("one")]), {
      type: "no_such_assertion",
      value: "anything",
    } as unknown as CaseAssertion);

    expect(result.pass).toBe(false);
    expect(result.message).toContain("no_such_assertion");
  });
});
