// ── Config ──────────────────────────────────────────────────────────
//
// Zod-validated configuration for the CI eval pipeline. Reads from
// environment variables and CLI flags, with sensible defaults derived
// from template placeholders.
//

import { z } from "zod";

/**
 * Configuration schema validated at startup.
 */
export const ConfigSchema = z.object({
  /** Directory containing YAML eval suite files */
  evalPath: z.string().default("evals"),
  /** Maximum allowed score regression (0.0–1.0) */
  regressionThreshold: z.coerce.number().min(0).max(1).default(0.05),
  /** Default LLM provider name */
  llmProvider: z.string().min(1, "LLM provider is required"),
  /** Path to the baseline JSON file */
  baselinePath: z.string().default(".eval-baseline.json"),
  /** Max parallel cases per suite */
  concurrency: z.coerce.number().int().positive().default(5),
  /** Log level */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables and optional overrides.
 * Does not read from a file — all values come from env or direct input.
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const raw = {
    evalPath: overrides.evalPath ?? process.env.EVAL_PATH,
    regressionThreshold:
      overrides.regressionThreshold ?? process.env.REGRESSION_THRESHOLD,
    llmProvider: overrides.llmProvider ?? process.env.LLM_PROVIDER,
    baselinePath: overrides.baselinePath ?? process.env.BASELINE_PATH,
    concurrency: overrides.concurrency ?? process.env.EVAL_CONCURRENCY,
    logLevel: overrides.logLevel ?? process.env.LOG_LEVEL,
  };

  return ConfigSchema.parse(raw);
}
