import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { EvalCase, EvalCaseSchema } from "./case.js";
import { resolveAssertion, type AssertionResult } from "./assertions.js";
import type { LlmProvider, ChatMessage } from "./providers/index.js";

/**
 * Schema for a YAML eval suite file.
 */
const EvalSuiteFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  cases: z.array(EvalCaseSchema),
});

/**
 * Result for a single eval case after running all its assertions.
 */
export interface CaseResult {
  name: string;
  pass: boolean;
  score: number;
  assertions: AssertionResult[];
  output: string;
  durationMs: number;
  error?: string;
}

/**
 * Aggregate result for an entire eval suite.
 */
export interface SuiteResult {
  name: string;
  description?: string;
  cases: CaseResult[];
  passRate: number;
  averageScore: number;
  durationMs: number;
}

/**
 * Represents a collection of eval cases loaded from a YAML file.
 * Handles running all cases against a provider and collecting results.
 */
export class EvalSuite {
  readonly name: string;
  readonly description?: string;
  readonly cases: EvalCase[];

  constructor(name: string, cases: EvalCase[], description?: string) {
    this.name = name;
    this.description = description;
    this.cases = cases;
  }

  /**
   * Load an eval suite from a YAML file path.
   */
  static async fromFile(filePath: string): Promise<EvalSuite> {
    const content = await readFile(filePath, "utf-8");
    const raw = parseYaml(content);
    const parsed = EvalSuiteFileSchema.parse(raw);

    const cases = parsed.cases.map((c) => new EvalCase(c));
    return new EvalSuite(parsed.name, cases, parsed.description);
  }

  /**
   * Run all cases in the suite against the given LLM provider.
   * Cases execute in parallel up to the specified concurrency limit.
   */
  async run(provider: LlmProvider, concurrency = 5): Promise<SuiteResult> {
    const suiteStart = Date.now();
    const caseResults: CaseResult[] = [];

    // Execute cases with bounded concurrency using a semaphore pattern
    let running = 0;
    const waitQueue: Array<() => void> = [];

    const waitForSlot = (): Promise<void> => {
      if (running < concurrency) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waitQueue.push(resolve);
      });
    };

    const releaseSlot = (): void => {
      running--;
      const next = waitQueue.shift();
      if (next) next();
    };

    const runCase = async (evalCase: EvalCase): Promise<void> => {
      const caseStart = Date.now();
      try {
        const messages: ChatMessage[] = [
          { role: "user", content: evalCase.prompt },
        ];
        const output = await provider.complete(messages);

        const assertionResults: AssertionResult[] = [];
        for (const assertionConfig of evalCase.assertions) {
          const assertionFn = resolveAssertion(assertionConfig.type, assertionConfig.value);
          const result = await assertionFn(output);
          assertionResults.push(result);
        }

        const allPass = assertionResults.every((r) => r.pass);
        const avgScore =
          assertionResults.length > 0
            ? assertionResults.reduce((sum, r) => sum + r.score, 0) / assertionResults.length
            : 1;

        caseResults.push({
          name: evalCase.name,
          pass: allPass,
          score: avgScore,
          assertions: assertionResults,
          output,
          durationMs: Date.now() - caseStart,
        });
      } catch (err) {
        caseResults.push({
          name: evalCase.name,
          pass: false,
          score: 0,
          assertions: [],
          output: "",
          durationMs: Date.now() - caseStart,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        releaseSlot();
      }
    };

    const tasks: Promise<void>[] = [];
    for (const evalCase of this.cases) {
      await waitForSlot();
      running++;
      tasks.push(runCase(evalCase));
    }
    await Promise.all(tasks);

    const passed = caseResults.filter((r) => r.pass).length;
    const totalScore = caseResults.reduce((sum, r) => sum + r.score, 0);

    return {
      name: this.name,
      description: this.description,
      cases: caseResults,
      passRate: caseResults.length > 0 ? passed / caseResults.length : 1,
      averageScore: caseResults.length > 0 ? totalScore / caseResults.length : 1,
      durationMs: Date.now() - suiteStart,
    };
  }
}
