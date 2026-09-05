// ── Runner ──────────────────────────────────────────────────────────
//
// Factory-based eval runner. createEvalRunner() returns an object with
// a single `run()` method that loads the YAML corpus, executes each
// suite against the configured LLM provider, and collects suite-level
// scores. No module-level mutable state — all state lives inside
// the factory closure.
//
// What the corpus does when it is empty belongs to `cases.ts`; what
// happens here is that nothing reaches a provider until it has loaded.
//

import { evaluateAssertion } from "./assertions.js";
import type { EvalCase, LoadedSuite } from "./cases.js";
import { coversBothKinds, loadSuites } from "./cases.js";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type { LlmProvider } from "./providers/index.js";
import type { EvalResult, SuiteScore } from "./types.js";

// ── Runner factory ──────────────────────────────────────────────────

export interface EvalRunner {
  run(): Promise<SuiteScore[]>;
}

/**
 * Create an eval runner that loads the YAML corpus, runs each suite against
 * the configured LLM provider, and returns suite-level scores.
 */
export function createEvalRunner(config: Config, logger: Logger): EvalRunner {
  async function runCase(provider: LlmProvider, caseSpec: EvalCase): Promise<EvalResult> {
    const start = Date.now();
    try {
      const output = await provider.complete(caseSpec.input);

      const assertionResults = caseSpec.assertions.map((a) =>
        evaluateAssertion(a.type, a.value, output),
      );

      // A case that checked nothing fails. The loader refuses an empty
      // assertion list, and the two layers agree so that neither one is the
      // only thing standing between "checked" and "reported as checked".
      const passed = assertionResults.filter((r) => r.pass).length;
      const total = assertionResults.length;

      return {
        name: caseSpec.name,
        pass: total > 0 && passed === total,
        score: total > 0 ? passed / total : 0,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: caseSpec.name,
        pass: false,
        score: 0,
        output: "",
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function runSuite(provider: LlmProvider, suite: LoadedSuite): Promise<SuiteScore> {
    logger.info(`Running suite: ${suite.name}`, { cases: suite.cases.length });

    const suiteStart = Date.now();
    const results: EvalResult[] = [];

    // Run cases with bounded concurrency
    let running = 0;
    const waitQueue: Array<() => void> = [];

    const waitForSlot = (): Promise<void> => {
      if (running < config.concurrency) return Promise.resolve();
      return new Promise<void>((resolve) => waitQueue.push(resolve));
    };

    const releaseSlot = (): void => {
      running--;
      const next = waitQueue.shift();
      if (next) next();
    };

    const tasks: Promise<void>[] = [];
    for (const caseSpec of suite.cases) {
      await waitForSlot();
      running++;
      tasks.push(
        runCase(provider, caseSpec).then((result) => {
          results.push(result);
          releaseSlot();
        }),
      );
    }
    await Promise.all(tasks);

    const passed = results.filter((r) => r.pass).length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);

    return {
      suite: suite.name,
      passed,
      total: results.length,
      // A suite with no result scores zero, not one: the baseline stores
      // these numbers, and a suite that ran nothing must not raise the bar
      // every later run is compared against.
      passRate: results.length > 0 ? passed / results.length : 0,
      averageScore: results.length > 0 ? totalScore / results.length : 0,
      durationMs: Date.now() - suiteStart,
      cases: results,
    };
  }

  return {
    async run(): Promise<SuiteScore[]> {
      // The corpus is read first. Provider modules build a client that needs
      // a key, so a run with nothing to run says that, rather than failing
      // earlier with a vendor SDK error about credentials.
      const suites = await loadSuites(config.evalPath);

      if (!coversBothKinds(suites)) {
        throw new Error(
          "The corpus covers one kind of case. Golden cases say what the surface does when " +
            "asked nicely; adversarial cases are the ones that find out what it does otherwise.",
        );
      }

      logger.info(`Discovered ${suites.length} suite(s)`);

      const { getProvider } = await import("./providers/index.js");
      const provider = getProvider(config.llmProvider);
      const scores: SuiteScore[] = [];

      for (const suite of suites) {
        const score = await runSuite(provider, suite);
        scores.push(score);

        logger.info(`Suite complete: ${score.suite}`, {
          passRate: score.passRate,
          averageScore: score.averageScore,
          durationMs: score.durationMs,
        });
      }

      return scores;
    },
  };
}
