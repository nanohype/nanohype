import { DEFAULT_PROVIDER, getProvider, type LlmProvider } from "./providers/index.js";
import { ConsoleReporter } from "./reporters/console.js";
import { JsonReporter } from "./reporters/json.js";
import type { EvalSuite, SuiteResult } from "./suite.js";

/**
 * Configuration for the eval runner.
 */
export interface RunnerConfig {
  /**
   * Suites to run, already loaded. Discovery lives in `corpus.ts` so that the
   * caller reads the corpus before this module pulls in the provider registry.
   */
  suites: EvalSuite[];
  /** Reporter type: "console" or "json" */
  reporter: "console" | "json";
  /** Optional provider override (defaults to template-configured provider) */
  provider?: string;
  /** Max parallel cases per suite */
  concurrency?: number;
  /** Output file path for JSON reporter (stdout if omitted) */
  outputFile?: string;
}

/**
 * Core eval runner. Runs every case in the given suites against the configured
 * LLM provider and delegates to the chosen reporter for output.
 */
export async function runEvals(config: RunnerConfig): Promise<SuiteResult[]> {
  const { suites, reporter: reporterType, provider: providerOverride, concurrency = 5 } = config;

  // Create LLM provider
  const provider: LlmProvider = getProvider(providerOverride ?? DEFAULT_PROVIDER);

  // Run all suites
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    const result = await suite.run(provider, concurrency);
    results.push(result);
  }

  // Report results
  if (reporterType === "json") {
    const reporter = new JsonReporter(config.outputFile);
    reporter.report(results);
  } else {
    const reporter = new ConsoleReporter();
    reporter.report(results);
  }

  return results;
}
