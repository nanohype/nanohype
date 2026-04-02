/**
 * Model comparison evaluator.
 *
 * Runs the same prompts through both a base model and a fine-tuned model,
 * then computes comparison metrics. Reads test examples from the prepared
 * test split and reports side-by-side results.
 */

import { readFile } from "node:fs/promises";
import type { TrainingProvider } from "../training/types.js";
import type { TrainingExample } from "../dataset/types.js";
import { parseJsonl } from "../dataset/validate.js";
import {
  computeComparisonMetrics,
  computeAggregateMetrics,
  type ComparisonResult,
  type AggregateMetrics,
} from "./metrics.js";
import { logger } from "../logger.js";

/**
 * Configuration for running an evaluation comparison.
 */
export interface EvalConfig {
  /** Path to the test JSONL file */
  testFile: string;
  /** Base model identifier */
  baseModel: string;
  /** Fine-tuned model identifier */
  fineTunedModel: string;
  /** Number of test examples to evaluate (0 = all) */
  sampleSize: number;
}

/**
 * Full evaluation report with per-example and aggregate results.
 */
export interface EvalReport {
  config: EvalConfig;
  comparisons: ComparisonResult[];
  aggregate: AggregateMetrics;
  durationMs: number;
}

/**
 * Extract the user prompt from a training example's message array.
 * Concatenates all user messages (there is typically one).
 */
function extractPrompt(example: TrainingExample): string {
  return example.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

/**
 * Run a side-by-side evaluation comparing base model and fine-tuned
 * model outputs on test examples.
 *
 * For each test example, sends the user prompt to both models, collects
 * responses, and computes comparison metrics. Returns a full report
 * with individual and aggregate results.
 */
export async function runEvalComparison(
  config: EvalConfig,
  provider: TrainingProvider,
): Promise<EvalReport> {
  const startTime = Date.now();

  // Load test examples
  logger.info("Loading test examples", { file: config.testFile });
  const content = await readFile(config.testFile, "utf-8");
  const { parsed, errors } = parseJsonl(content);

  if (errors.length > 0) {
    logger.warn("Some test examples failed to parse", { errorCount: errors.length });
  }

  let examples = parsed as TrainingExample[];
  if (config.sampleSize > 0 && examples.length > config.sampleSize) {
    examples = examples.slice(0, config.sampleSize);
  }

  logger.info("Running evaluation", {
    exampleCount: examples.length,
    baseModel: config.baseModel,
    fineTunedModel: config.fineTunedModel,
  });

  // Run comparisons
  const comparisons: ComparisonResult[] = [];

  for (let i = 0; i < examples.length; i++) {
    const prompt = extractPrompt(examples[i]);
    logger.debug(`Evaluating example ${i + 1}/${examples.length}`);

    try {
      const [baseOutput, fineTunedOutput] = await Promise.all([
        provider.complete(config.baseModel, prompt),
        provider.complete(config.fineTunedModel, prompt),
      ]);

      comparisons.push(computeComparisonMetrics(prompt, baseOutput, fineTunedOutput));
    } catch (err) {
      logger.error(`Failed to evaluate example ${i + 1}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const aggregate = computeAggregateMetrics(comparisons);
  const durationMs = Date.now() - startTime;

  return {
    config,
    comparisons,
    aggregate,
    durationMs,
  };
}
