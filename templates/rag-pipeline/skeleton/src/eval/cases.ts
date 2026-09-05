/**
 * Loading the eval corpus.
 *
 * Split from the runner because the decision that matters is what happens
 * when there is nothing to run. A runner that finds no cases and exits 0
 * reports a passing eval, and that reads exactly like a passing eval over a
 * full corpus — so the corpus is loaded by something that refuses to hand back
 * an empty one, and the refusal is covered by the unit suite rather than left
 * to whoever next reads the runner.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** One case: a question to put through the pipeline, and what must hold of the answer. */
export interface EvalCase {
  name: string;
  kind: "golden" | "adversarial";
  input: string;
  assertions: CaseAssertion[];
  notes?: string;
}

export interface CaseAssertion {
  type: "contains" | "not_contains" | "matches_pattern" | "cites_source" | "retrieved_source";
  value: string;
  why?: string;
}

export class EmptyCorpusError extends Error {}

/** The shape a case file holds, worded the same wherever a message asks for one. */
const CASE_SHAPE =
  "a name, a kind (golden|adversarial), an input, and at least one assertion, each with a " +
  "type and a value";

function isAssertion(value: unknown): value is CaseAssertion {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<CaseAssertion>;
  return typeof a.type === "string" && a.type.length > 0 && typeof a.value === "string";
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
 * plain error naming the file when one of them is not a case — whether it does
 * not parse or parses to the wrong shape. A malformed case that is skipped in
 * silence is a case that stops running with nothing saying so.
 */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new EmptyCorpusError(
      `No eval cases: ${dir} cannot be read. Create it and add a JSON file with ${CASE_SHAPE}.`,
    );
  }

  const cases: EvalCase[] = [];
  for (const file of entries.filter((f) => f.endsWith(".json")).sort()) {
    const raw = await readFile(join(dir, file), "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // The parse error reports a position, not the file that position is in.
      throw new Error(`${file} is not JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!isCase(parsed)) {
      throw new Error(`${file} is not an eval case: needs ${CASE_SHAPE}`);
    }
    cases.push(parsed);
  }

  if (cases.length === 0) {
    throw new EmptyCorpusError(
      `No eval cases in ${dir}. An eval that runs nothing reports the same result as one ` +
        "that runs everything and passes, so this is a failure rather than a quiet zero. " +
        `Add a JSON file to ${dir} with ${CASE_SHAPE}.`,
    );
  }

  return cases;
}

/** True when the corpus covers both kinds. Golden alone has not looked. */
export function coversBothKinds(cases: EvalCase[]): boolean {
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
