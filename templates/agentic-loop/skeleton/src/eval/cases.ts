import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Loading the eval corpus.
 *
 * Split from the runner because the decision that matters here is what to do
 * when there is nothing to run. A runner that finds no cases and exits 0
 * reports a passing eval, and a passing eval over an empty corpus reads
 * exactly like a passing eval over a full one — so the corpus is loaded by
 * something that refuses to return an empty one, and the refusal is covered
 * by the unit suite rather than left to whoever next reads the runner.
 */

/** One case: an input to send, and what must hold of what comes back. */
export interface EvalCase {
  name: string;
  kind: "golden" | "adversarial";
  input: string;
  assertions: CaseAssertion[];
  notes?: string;
}

export interface CaseAssertion {
  type: "contains" | "not_contains" | "matches_pattern" | "tool_was_called" | "max_iterations";
  value: string | number;
  why?: string;
}

export class EmptyCorpusError extends Error {}

function isCase(value: unknown): value is EvalCase {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<EvalCase>;
  return (
    typeof c.name === "string" &&
    (c.kind === "golden" || c.kind === "adversarial") &&
    typeof c.input === "string" &&
    Array.isArray(c.assertions) &&
    c.assertions.length > 0
  );
}

/**
 * Read every case in `dir`.
 *
 * Throws {@link EmptyCorpusError} when the directory holds no case, and a
 * plain error naming the file when one does not parse or is not a case — a
 * malformed case that is silently skipped is a case that stops running
 * without anything saying so.
 */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new EmptyCorpusError(
      `No eval cases: ${dir} cannot be read. Create it and add a .json file holding name, ` +
        "kind (golden or adversarial), input, and at least one assertion.",
    );
  }

  const cases: EvalCase[] = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(join(dir, file), "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${file} is not valid JSON: ${detail}`);
    }
    if (!isCase(parsed)) {
      throw new Error(
        `${file} is not an eval case: needs name, kind (golden|adversarial), input, ` +
          "and at least one assertion",
      );
    }
    cases.push(parsed);
  }

  if (cases.length === 0) {
    throw new EmptyCorpusError(
      `No eval cases in ${dir}. An eval that runs nothing reports the same result as one ` +
        "that runs everything and passes, so this is a failure rather than a quiet zero. " +
        `Add a .json file under ${dir} holding name, kind (golden or adversarial), input, ` +
        "and at least one assertion.",
    );
  }

  return cases;
}

/** True when the corpus covers both kinds. Golden alone has not looked. */
export function coversBothKinds(cases: EvalCase[]): boolean {
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
