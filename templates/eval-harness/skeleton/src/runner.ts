import { glob } from "node:fs/promises";
import { resolve } from "node:path";
import { EvalSuite, type SuiteResult } from "./suite.js";
import { getProvider, DEFAULT_PROVIDER, type LlmProvider } from "./providers/index.js";
import { ConsoleReporter } from "./reporters/console.js";
import { JsonReporter } from "./reporters/json.js";

/**
 * Configuration for the eval runner.
 */
export interface RunnerConfig {
  /** Glob pattern for suite YAML files */
  suiteGlob: string;
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
 * Core eval runner. Discovers suite files, loads them, runs all cases
 * against the configured LLM provider, and delegates to the chosen
 * reporter for output.
 */
export async function runEvals(config: RunnerConfig): Promise<SuiteResult[]> {
  const {
    suiteGlob,
    reporter: reporterType,
    provider: providerOverride,
    concurrency = 5,
  } = config;

  // Discover suite files
  const suitePaths: string[] = [];
  for await (const entry of glob(suiteGlob)) {
    suitePaths.push(resolve(entry));
  }
  suitePaths.sort();

  if (suitePaths.length === 0) {
    console.warn(`No suite files found matching: ${suiteGlob}`);
    return [];
  }

  // Load suites
  const suites: EvalSuite[] = [];
  for (const suitePath of suitePaths) {
    const suite = await EvalSuite.fromFile(suitePath);
    suites.push(suite);
  }

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
