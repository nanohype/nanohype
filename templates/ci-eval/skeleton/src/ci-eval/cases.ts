// ── Corpus ──────────────────────────────────────────────────────────
//
// Discovery, parsing and validation of the YAML suite files, split from
// the runner because the decision that matters here is what to do when
// there is nothing to run. A gate that finds no cases and exits 0 reports
// a pass over an empty corpus, and that reads exactly like a pass over a
// full one — in a check whose whole job is to block a pull request, the
// silent version of failure is the expensive one.
//
// So the corpus is loaded by something that refuses to hand back an empty
// one, refuses a case that would pass having checked nothing, and refuses
// a malformed suite rather than skipping it. Each refusal is covered by
// the unit suite, so it stays a property of the loader rather than a
// convention the next reader of the runner has to notice.
//

import { glob, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

// ── Suite file schema ───────────────────────────────────────────────

const AssertionSchema = z.object({
  /** Assertion type, dispatched through the registry in `assertions.ts`. */
  type: z.string().min(1),
  /**
   * What the assertion compares against. Required, and required to be
   * something: an assertion with no value checks the output against nothing
   * and reports it as checked. Null and the empty string are the same hole —
   * `contains ""` holds for every output.
   */
  value: z
    .unknown()
    .refine((v) => v !== undefined && v !== null, "an assertion needs a value")
    .refine((v) => typeof v !== "string" || v.length > 0, "an assertion value cannot be empty"),
  /** Why this must hold. Load-bearing on an adversarial case, where the
   * assertion is usually a refusal and the value alone does not say why. */
  why: z.string().optional(),
});

const CaseSchema = z.object({
  name: z.string().min(1),
  /** golden: the behaviour the surface exists to deliver. adversarial:
   * input trying to make it do something else. */
  kind: z.enum(["golden", "adversarial"]),
  input: z.string().min(1),
  assertions: z
    .array(AssertionSchema)
    .min(1, "a case needs an assertion; an empty list passes having checked nothing"),
  notes: z.string().optional(),
});

const SuiteFileSchema = z.object({
  /** Optional: a suite name falls back to the file's basename, so the field
   * earns its keep only when the report should say something else. */
  name: z.string().optional(),
  description: z.string().optional(),
  cases: z
    .array(CaseSchema)
    .min(1, "a suite needs a case; an empty suite scores a pass over nothing"),
});

export type EvalCase = z.infer<typeof CaseSchema>;

/** One suite file, under the name its scores are reported and stored by. */
export interface LoadedSuite {
  name: string;
  path: string;
  cases: EvalCase[];
}

/** Raised when the eval path yields nothing to run. */
export class EmptyCorpusError extends Error {}

/** Suite files under `evalPath`, in a stable order. */
async function discover(evalPath: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of glob(`${evalPath}/**/*.{yaml,yml}`)) {
    paths.push(resolve(String(entry)));
  }
  return paths.sort();
}

/**
 * Read every suite under `evalPath`.
 *
 * Throws {@link EmptyCorpusError} when the path yields no suite, and a plain
 * error when a file under it is not one — a suite skipped in silence is a
 * suite that stopped running with nothing saying so.
 */
export async function loadSuites(evalPath: string): Promise<LoadedSuite[]> {
  let paths: string[];
  try {
    paths = await discover(evalPath);
  } catch {
    throw new EmptyCorpusError(
      `No eval suites: ${evalPath} cannot be read. Create it and add a .yaml suite holding a ` +
        "name and a cases list, each case with a name, a kind of golden or adversarial, an " +
        "input, and at least one assertion.",
    );
  }

  if (paths.length === 0) {
    throw new EmptyCorpusError(
      `No eval suites under ${evalPath}. A run with nothing in it reports what a run over the ` +
        "whole corpus reports when it passes, so this is a failure rather than a quiet zero. " +
        "Add a .yaml suite there holding a name and a cases list, each case with a name, a kind " +
        "of golden or adversarial, an input, and at least one assertion.",
    );
  }

  const suites: LoadedSuite[] = [];
  for (const path of paths) {
    const parsed = SuiteFileSchema.safeParse(parseYaml(await readFile(path, "utf-8")));
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new Error(`${path} is not an eval suite — ${detail}`);
    }
    suites.push({
      name: parsed.data.name || basename(path, extname(path)),
      path,
      cases: parsed.data.cases,
    });
  }

  return suites;
}

/** True when the corpus covers both kinds. Golden alone has not looked. */
export function coversBothKinds(suites: LoadedSuite[]): boolean {
  const kinds = new Set(suites.flatMap((suite) => suite.cases).map((one) => one.kind));
  return kinds.has("golden") && kinds.has("adversarial");
}
