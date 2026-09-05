// ── Eval Corpus Loader ──────────────────────────────────────────────
//
// Loading the corpus is separate from running it because the decision
// that matters here is what to do when there is nothing to run. A runner
// that finds no cases and exits 0 reports a passing eval, and a passing
// eval over an empty corpus reads exactly like a passing eval over a
// full one. So the corpus is loaded by something that refuses to return
// an empty one, and the refusal is held by the unit suite rather than
// left to whoever next reads the runner.
//

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** The checks a case may ask the runner to apply to a plan. */
export type AssertionType =
  | "min_subtasks"
  | "max_subtasks"
  | "has_dependency_edge"
  | "dependencies_resolvable"
  | "plan_contains"
  | "plan_not_contains";

export const ASSERTION_TYPES: readonly AssertionType[] = [
  "min_subtasks",
  "max_subtasks",
  "has_dependency_edge",
  "dependencies_resolvable",
  "plan_contains",
  "plan_not_contains",
];

/** One thing that must hold of the plan the orchestrator produced. */
export interface CaseAssertion {
  type: AssertionType;
  value: string | number | boolean;
  /** Why this must hold. Load-bearing on adversarial cases. */
  why?: string;
}

/** One case: a goal to orchestrate, and what must hold of the plan. */
export interface EvalCase {
  name: string;
  kind: "golden" | "adversarial";
  input: string;
  assertions: CaseAssertion[];
  notes?: string;
}

/** Thrown when the corpus holds nothing to run. */
export class EmptyCorpusError extends Error {}

function isAssertion(value: unknown): value is CaseAssertion {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<CaseAssertion>;
  return (
    typeof a.type === "string" &&
    (ASSERTION_TYPES as readonly string[]).includes(a.type) &&
    a.value !== undefined
  );
}

function isCase(value: unknown): value is EvalCase {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<EvalCase>;
  return (
    typeof c.name === "string" &&
    (c.kind === "golden" || c.kind === "adversarial") &&
    typeof c.input === "string" &&
    Array.isArray(c.assertions) &&
    c.assertions.length > 0 &&
    c.assertions.every(isAssertion)
  );
}

/**
 * Read every case in `dir`.
 *
 * Throws {@link EmptyCorpusError} when the directory holds no case, and a
 * plain error naming the file when one is not JSON, or is JSON that is not
 * a case — a malformed case skipped in silence is a case that stops running
 * with nothing saying so.
 */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new EmptyCorpusError(
      `No eval cases: ${dir} cannot be read. Create it and put a case file in it.`,
    );
  }

  const cases: EvalCase[] = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(join(dir, file), "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${file} is not JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!isCase(parsed)) {
      throw new Error(
        `${file} is not an eval case: needs name, kind (golden|adversarial), input, and ` +
          `at least one assertion drawn from ${ASSERTION_TYPES.join(", ")}`,
      );
    }
    cases.push(parsed);
  }

  if (cases.length === 0) {
    throw new EmptyCorpusError(
      `No eval cases in ${dir}. An eval that runs nothing reports the same result as one ` +
        "that runs everything and passes, so this is a failure rather than a quiet zero. " +
        `Write a .json file in ${dir} holding a name, a kind of golden or adversarial, the ` +
        "input goal, and at least one assertion.",
    );
  }

  return cases;
}

/** True when the corpus covers both kinds. Golden alone has not looked. */
export function coversBothKinds(cases: EvalCase[]): boolean {
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
