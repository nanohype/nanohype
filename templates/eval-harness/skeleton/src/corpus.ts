import { glob } from "node:fs/promises";
import { resolve } from "node:path";
import type { EvalCase } from "./case.js";
import { EvalSuite } from "./suite.js";

/**
 * Discovering the corpus.
 *
 * Split from the runner because the decision that matters here is what to do
 * when there is nothing to run. A runner that matches no suite file, or matches
 * suite files holding no case, and exits 0 reports a passing eval over an empty
 * corpus — which reads exactly like a passing eval over a full one. So loading
 * is done by something that refuses to return an empty corpus, and the refusal
 * is covered by the unit suite rather than left to whoever next reads the CLI.
 *
 * Nothing here touches a provider, so this module can be loaded before the
 * provider registry builds a vendor client.
 */

export class EmptyCorpusError extends Error {}

/**
 * Load every suite matching `suiteGlob`.
 *
 * Throws {@link EmptyCorpusError} when the glob matches no file, or when the
 * files it matches declare no case between them. A malformed suite file throws
 * from {@link EvalSuite.fromFile} rather than being skipped — a suite skipped
 * in silence is a suite that stops running with nothing saying so.
 */
export async function loadCorpus(suiteGlob: string): Promise<EvalSuite[]> {
  const suitePaths: string[] = [];
  for await (const entry of glob(suiteGlob)) {
    suitePaths.push(resolve(entry));
  }
  suitePaths.sort();

  if (suitePaths.length === 0) {
    throw new EmptyCorpusError(
      `No eval suite files match ${suiteGlob}. An eval that runs nothing reports the same ` +
        "result as one that runs everything and passes, so this is a failure rather than a " +
        "quiet zero. Add a .yaml suite at that path holding a name and a cases list, each case " +
        "with a name, a kind of golden or adversarial, an input, and at least one assertion.",
    );
  }

  const suites: EvalSuite[] = [];
  for (const suitePath of suitePaths) {
    suites.push(await EvalSuite.fromFile(suitePath));
  }

  if (allCases(suites).length === 0) {
    throw new EmptyCorpusError(
      `The suite files matching ${suiteGlob} declare no cases between them. A suite with ` +
        "nothing in it passes having checked nothing. Add a case to one of them, with a name, " +
        "a kind of golden or adversarial, an input, and at least one assertion.",
    );
  }

  return suites;
}

/** Every case across every suite, in suite order. */
export function allCases(suites: EvalSuite[]): EvalCase[] {
  return suites.flatMap((suite) => suite.cases);
}

/**
 * True when the corpus covers both kinds. Golden cases say what the surface
 * does when asked nicely; adversarial cases find out what it does otherwise,
 * and a corpus without them has not looked.
 */
export function coversBothKinds(suites: EvalSuite[]): boolean {
  const cases = allCases(suites);
  return cases.some((c) => c.kind === "golden") && cases.some((c) => c.kind === "adversarial");
}
