/**
 * Loading the eval corpus.
 *
 * Split from the comparison run because the decision that matters here is
 * what to do when there is nothing to run. A run that finds no cases and
 * exits 0 reports a passing eval, and a passing eval over an empty corpus
 * reads exactly like a passing eval over a full one. So the corpus is loaded
 * by something that refuses to return an empty one, and the refusal is
 * covered by the unit suite rather than left to whoever next reads the
 * runner.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The assertion vocabulary the runner implements. A case naming anything
 * else is refused at load, before the run spends a model call on it.
 */
export const ASSERTION_TYPES = ["contains", "not_contains", "matches_pattern"] as const;

export type AssertionType = (typeof ASSERTION_TYPES)[number];

/** One check against the fine-tuned model's output. */
export interface CaseAssertion {
  type: AssertionType;
  value: string;
  /**
   * Why the check must hold. Load-bearing on an adversarial case, where the
   * assertion is often the absence of something and the reason is not
   * obvious from the value.
   */
  why?: string;
}

/**
 * One case: a prompt to send, and what must hold of what comes back.
 *
 * `golden` is the behaviour the tuning exists to deliver. `adversarial` is
 * input trying to make the tuned model do something else.
 */
export interface EvalCase {
  name: string;
  kind: "golden" | "adversarial";
  input: string;
  assertions: CaseAssertion[];
  notes?: string;
}

/** Thrown when a corpus directory yields no case. */
export class EmptyCorpusError extends Error {}

function isAssertion(value: unknown): value is CaseAssertion {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<CaseAssertion>;
  return (
    ASSERTION_TYPES.includes(a.type as AssertionType) &&
    typeof a.value === "string" &&
    a.value.length > 0
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

function isValidPattern(pattern: string): boolean {
  try {
    return Boolean(new RegExp(pattern));
  } catch {
    return false;
  }
}

/**
 * Read every case in `dir`.
 *
 * Throws {@link EmptyCorpusError} when the directory holds no case, and a
 * plain error when a file in it is not one. A malformed case that is
 * silently skipped is a case that stops running with nothing saying so.
 * Every refusal names the file it read, because the caller passes a
 * directory and a message without a filename does not say what to open.
 */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new EmptyCorpusError(`No eval cases: ${dir} cannot be read`);
  }

  const cases: EvalCase[] = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(join(dir, file), "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${file} is not JSON: ${(error as Error).message}`);
    }
    if (!isCase(parsed)) {
      throw new Error(
        `${file} is not an eval case: needs name, kind (golden|adversarial), input, and at ` +
          `least one assertion of type ${ASSERTION_TYPES.join(" | ")}`,
      );
    }
    for (const assertion of parsed.assertions) {
      if (assertion.type === "matches_pattern" && !isValidPattern(assertion.value)) {
        throw new Error(`${file}: "${assertion.value}" is not a valid regular expression`);
      }
    }
    cases.push(parsed);
  }

  if (cases.length === 0) {
    throw new EmptyCorpusError(
      `No eval cases in ${dir}. An eval that runs nothing reports the same result as one ` +
        "that runs everything and passes, so this is a failure rather than a quiet zero. " +
        "Add a .json file there holding a name, a kind of golden or adversarial, the input " +
        `prompt to send, and at least one assertion of type ${ASSERTION_TYPES.join(" | ")}.`,
    );
  }

  return cases;
}

/**
 * True when the corpus covers both kinds. Golden cases alone say what the
 * tuned model does when asked for the form it was trained on; without an
 * adversarial case, nothing has asked what it does otherwise.
 */
export function coversBothKinds(cases: EvalCase[]): boolean {
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
