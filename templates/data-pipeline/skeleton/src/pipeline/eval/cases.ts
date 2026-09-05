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

/** The assertions the runner knows how to check. */
export const ASSERTION_TYPES = [
  "chunk_count_between",
  "split_between",
  "kept_together",
  "text_preserved",
  "no_chunk_matches",
  "max_chunk_chars",
  "every_chunk_embedded",
  "nearest_chunk",
] as const;

export type AssertionType = (typeof ASSERTION_TYPES)[number];

/**
 * One assertion over a run's chunks and their vectors.
 *
 * `why` carries the reason the assertion has to hold. On an adversarial case
 * the value alone rarely says it — a bound on the chunk count is a bound on
 * what the input was able to do to the split.
 */
export type CaseAssertion =
  /** Chunk count within [min, max] inclusive. */
  | { type: "chunk_count_between"; value: [number, number]; why?: string }
  /** The two texts first appear in different chunks. */
  | { type: "split_between"; value: [string, string]; why?: string }
  /** The two texts first appear in the same chunk. */
  | { type: "kept_together"; value: [string, string]; why?: string }
  /** The text survives into a chunk verbatim. */
  | { type: "text_preserved"; value: string; why?: string }
  /** No chunk matches the pattern. */
  | { type: "no_chunk_matches"; value: string; why?: string }
  /** No chunk is longer than this many characters. */
  | { type: "max_chunk_chars"; value: number; why?: string }
  /** Every chunk carries a finite vector of the provider's dimensionality. */
  | { type: "every_chunk_embedded"; value: true; why?: string }
  /** The chunk nearest [probe] contains [expected]. */
  | { type: "nearest_chunk"; value: [string, string]; why?: string };

/** One case: a document to run through the pipeline, and what must hold of it. */
export interface EvalCase {
  name: string;
  kind: "golden" | "adversarial";
  input: string;
  assertions: CaseAssertion[];
  notes?: string;
}

export class EmptyCorpusError extends Error {}

function isStringPair(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === "string" && v.length > 0)
  );
}

function isNumberPair(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number");
}

function isText(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

/**
 * The value shape each assertion is checked against.
 *
 * Shapes are settled here rather than in the runner so a case carrying a value
 * the assertion cannot read is refused at load, where the message names the
 * file, instead of failing mid-run where it reads like a finding about the
 * pipeline.
 */
const ASSERTION_SHAPES: Record<AssertionType, (value: unknown) => boolean> = {
  chunk_count_between: isNumberPair,
  split_between: isStringPair,
  kept_together: isStringPair,
  text_preserved: isText,
  no_chunk_matches: isText,
  max_chunk_chars: (value) => typeof value === "number" && value > 0,
  every_chunk_embedded: (value) => value === true,
  nearest_chunk: isStringPair,
};

/** What disqualifies `value` as a case, or null when it is one. */
function caseProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "not an object";

  const c = value as Partial<EvalCase>;
  if (typeof c.name !== "string" || c.name.length === 0) return "needs a name";
  if (c.kind !== "golden" && c.kind !== "adversarial") return "needs kind (golden|adversarial)";
  if (typeof c.input !== "string" || c.input.length === 0) return "needs input";
  if (!Array.isArray(c.assertions) || c.assertions.length === 0) {
    return "needs at least one assertion, or it passes having checked nothing";
  }

  for (const assertion of c.assertions) {
    if (typeof assertion !== "object" || assertion === null)
      return "has an assertion that is not an object";
    const { type, value: expected } = assertion as { type?: unknown; value?: unknown };
    if (typeof type !== "string" || !(ASSERTION_TYPES as readonly string[]).includes(type)) {
      return `names assertion "${String(type)}", which no runner assertion implements — one of ${ASSERTION_TYPES.join(", ")}`;
    }
    if (!ASSERTION_SHAPES[type as AssertionType](expected)) {
      return `gives assertion "${type}" a value it cannot be checked against`;
    }
  }

  return null;
}

/** What a case file holds, for the messages that ask for one. */
const CASE_SHAPE =
  "a JSON file holding a name, a kind of golden or adversarial, the input document, and the " +
  "assertions that have to hold of the chunks it produces";

/**
 * Read every case in `dir`.
 *
 * Throws {@link EmptyCorpusError} when the directory holds no case, and a
 * plain error when a file in it is not one, whether it fails to parse or
 * parses to a shape the runner cannot run — a malformed case that is silently
 * skipped is a case that stops running without anything saying so.
 */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new EmptyCorpusError(
      `No eval cases: ${dir} cannot be read. Create it and add ${CASE_SHAPE}.`,
    );
  }

  const cases: EvalCase[] = [];
  for (const file of entries.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(join(dir, file), "utf-8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Named by file, because a parser reports an offset into a document it
      // cannot say the name of.
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${file} is not an eval case: it is not JSON (${detail})`);
    }

    const problem = caseProblem(parsed);
    if (problem !== null) {
      throw new Error(`${file} is not an eval case: it ${problem}`);
    }
    cases.push(parsed as EvalCase);
  }

  if (cases.length === 0) {
    throw new EmptyCorpusError(
      `No eval cases in ${dir}. An eval that runs nothing reports the same result as one ` +
        "that runs everything and passes, so this is a failure rather than a quiet zero. " +
        `Add ${CASE_SHAPE} to that directory.`,
    );
  }

  return cases;
}

/** True when the corpus covers both kinds. Golden alone has not looked. */
export function coversBothKinds(cases: EvalCase[]): boolean {
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
