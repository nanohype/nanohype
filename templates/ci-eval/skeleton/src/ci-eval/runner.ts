// ── Runner ──────────────────────────────────────────────────────────
//
// Factory-based eval runner. createEvalRunner() returns an object with
// a single `run()` method that discovers YAML suites, executes each
// against the configured LLM provider, and collects suite-level
// scores. No module-level mutable state — all state lives inside
// the factory closure.
//

import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { getProvider } from "./providers/index.js";
import type { LlmProvider } from "./providers/index.js";
import { evaluateAssertion } from "./assertions.js";
import type { Config } from "./config.js";
import type { EvalResult, SuiteScore } from "./types.js";
import type { Logger } from "./logger.js";

// ── Suite file schema ───────────────────────────────────────────────

const AssertionSchema = z.object({
  type: z.string(),
  value: z.unknown(),
});

const CaseSchema = z.object({
  name: z.string(),
  input: z.string(),
  expected: z.string().optional(),
  assertions: z.array(AssertionSchema).optional().default([]),
  tags: z.array(z.string()).optional(),
  timeout: z.number().optional().default(30_000),
});

const SuiteFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  cases: z.array(CaseSchema),
});

type SuiteFile = z.infer<typeof SuiteFileSchema>;
type CaseSpec = z.infer<typeof CaseSchema>;

// ── Runner factory ──────────────────────────────────────────────────

export interface EvalRunner {
  run(): Promise<SuiteScore[]>;
}

/**
 * Create an eval runner that discovers YAML suites, runs each against
 * the configured LLM provider, and returns suite-level scores.
 */
export function createEvalRunner(config: Config, logger: Logger): EvalRunner {
  async function discoverSuites(): Promise<string[]> {
    const pattern = `${config.evalPath}/**/*.{yaml,yml}`;
    const paths: string[] = [];
    for await (const entry of glob(pattern)) {
      paths.push(resolve(String(entry)));
    }
    paths.sort();
    return paths;
  }

  async function loadSuite(filePath: string): Promise<SuiteFile> {
    const content = await readFile(filePath, "utf-8");
    const raw = parseYaml(content);
    return SuiteFileSchema.parse(raw);
  }

  async function runCase(
    provider: LlmProvider,
    caseSpec: CaseSpec,
  ): Promise<EvalResult> {
    const start = Date.now();
    try {
      const output = await provider.complete(caseSpec.input);

      const assertionResults = caseSpec.assertions.map((a) =>
        evaluateAssertion(a.type, a.value, output),
      );

      const allPass =
        assertionResults.length === 0 || assertionResults.every((r) => r.pass);
      const score =
        assertionResults.length > 0
          ? assertionResults.filter((r) => r.pass).length /
            assertionResults.length
          : 1;

      return {
        name: caseSpec.name,
        pass: allPass,
        score,
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

  async function runSuite(
    provider: LlmProvider,
    suite: SuiteFile,
    filePath: string,
  ): Promise<SuiteScore> {
    const suiteName = suite.name || basename(filePath, ".yaml");
    logger.info(`Running suite: ${suiteName}`, { cases: suite.cases.length });

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
      suite: suiteName,
      passed,
      total: results.length,
      passRate: results.length > 0 ? passed / results.length : 1,
      averageScore: results.length > 0 ? totalScore / results.length : 1,
      durationMs: Date.now() - suiteStart,
      cases: results,
    };
  }

  return {
    async run(): Promise<SuiteScore[]> {
      const suitePaths = await discoverSuites();
      if (suitePaths.length === 0) {
        logger.warn("No eval suites found", { pattern: config.evalPath });
        return [];
      }

      logger.info(`Discovered ${suitePaths.length} suite(s)`);

      const provider = getProvider(config.llmProvider);
      const scores: SuiteScore[] = [];

      for (const filePath of suitePaths) {
        const suite = await loadSuite(filePath);
        const score = await runSuite(provider, suite, filePath);
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
