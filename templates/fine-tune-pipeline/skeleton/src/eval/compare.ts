/**
 * Corpus-driven comparison of a base model against its fine-tuned
 * counterpart.
 *
 * Every case in the corpus goes to both models. The assertions are checked
 * against the fine-tuned output — that is the model the pipeline produced
 * and the one a project is deciding whether to ship — and the base output
 * stands beside it as the measure of what tuning changed.
 *
 * The corpus is read before the provider is built. A provider client is
 * constructed with credentials, so a run with nothing to run has to fail
 * saying the corpus is empty rather than failing about a missing key.
 */

import { logger } from "../logger.js";
import type { TrainingProvider } from "../training/types.js";
import { type AssertionResult, checkAssertions } from "./assertions.js";
import { coversBothKinds, type EvalCase, loadCases } from "./cases.js";
import {
  type AggregateMetrics,
  type ComparisonResult,
  computeAggregateMetrics,
  computeComparisonMetrics,
} from "./metrics.js";

/**
 * Configuration for running an evaluation.
 */
export interface EvalConfig {
  /** Directory holding the eval corpus, one JSON case per file */
  casesDir: string;
  /** Base model identifier */
  baseModel: string;
  /** Fine-tuned model identifier, from a completed fine-tuning job */
  fineTunedModel?: string;
}

/**
 * What one case produced: the two outputs, how they compare, and whether
 * the fine-tuned output held up its assertions.
 */
export interface CaseOutcome {
  evalCase: EvalCase;
  comparison?: ComparisonResult;
  assertions: AssertionResult[];
  error?: string;
}

/**
 * Full evaluation report with per-case and aggregate results.
 */
export interface EvalReport {
  config: EvalConfig;
  outcomes: CaseOutcome[];
  aggregate: AggregateMetrics;
  durationMs: number;
  passed: boolean;
}

/** A case passes when it ran and every assertion it carries held. */
export function casePassed(outcome: CaseOutcome): boolean {
  return (
    outcome.error === undefined &&
    outcome.assertions.length > 0 &&
    outcome.assertions.every((a) => a.pass)
  );
}

/**
 * Run the eval corpus against the fine-tuned model, with the base model
 * alongside for comparison.
 *
 * The provider is passed as a factory rather than an instance so that
 * nothing constructs a client until the corpus is in hand.
 */
export async function runEvalComparison(
  config: EvalConfig,
  createProvider: () => TrainingProvider,
): Promise<EvalReport> {
  const startTime = Date.now();

  logger.info("Loading eval corpus", { dir: config.casesDir });
  const cases = await loadCases(config.casesDir);

  if (!coversBothKinds(cases)) {
    throw new Error(
      "The corpus covers only one kind of case. Golden cases say what the tuned model does " +
        "when asked for the form it was trained on; adversarial cases are the ones that find " +
        "out what it does otherwise.",
    );
  }

  const fineTunedModel = config.fineTunedModel;
  if (!fineTunedModel) {
    throw new Error(
      "No fine-tuned model to evaluate. Set FINE_TUNED_MODEL to the model id from a " +
        "completed fine-tuning job.",
    );
  }

  const provider = createProvider();

  logger.info("Running evaluation", {
    caseCount: cases.length,
    baseModel: config.baseModel,
    fineTunedModel,
  });

  const outcomes: CaseOutcome[] = [];

  for (const evalCase of cases) {
    logger.debug("Evaluating case", { name: evalCase.name, kind: evalCase.kind });

    try {
      const [baseOutput, fineTunedOutput] = await Promise.all([
        provider.complete(config.baseModel, evalCase.input),
        provider.complete(fineTunedModel, evalCase.input),
      ]);

      outcomes.push({
        evalCase,
        comparison: computeComparisonMetrics(evalCase.input, baseOutput, fineTunedOutput),
        assertions: checkAssertions(evalCase, fineTunedOutput),
      });
    } catch (err) {
      // A case that could not run is a case whose assertions went unchecked,
      // which is a failure rather than a gap in the summary.
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Case failed to run", { name: evalCase.name, error: message });
      outcomes.push({ evalCase, assertions: [], error: message });
    }
  }

  const comparisons = outcomes
    .map((o) => o.comparison)
    .filter((c): c is ComparisonResult => c !== undefined);

  return {
    config,
    outcomes,
    aggregate: computeAggregateMetrics(comparisons),
    durationMs: Date.now() - startTime,
    passed: outcomes.every(casePassed),
  };
}
