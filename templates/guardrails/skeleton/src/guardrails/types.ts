// ── Guardrail Types ──────────────────────────────────────────────────
//
// Core type definitions for the guardrails module. All filters and
// the pipeline reference these types.

/**
 * A single policy violation detected by a filter. Each violation
 * carries enough context for logging, auditing, and user-facing
 * error messages.
 */
export interface Violation {
  /** Which filter produced this violation (e.g. "prompt-injection") */
  filter: string;

  /** Human-readable description of what was detected */
  message: string;

  /** Severity level — "block" halts the pipeline, "warn" is advisory */
  severity: "block" | "warn";
}

/**
 * Result returned by every filter's `filter` method. The pipeline
 * collects results from each filter and merges them into a single
 * aggregate result.
 */
export interface FilterResult {
  /** Whether the content is allowed to proceed */
  allowed: boolean;

  /** The (possibly redacted) content after filtering */
  filtered: string;

  /** All violations detected by this filter */
  violations: Violation[];
}

/**
 * Direction of the content being filtered. Filters may apply
 * different rules depending on whether content is user input
 * headed to the LLM or LLM output headed to the user.
 */
export type Direction = "input" | "output";

/**
 * Configuration for the guardrail pipeline. Controls which filters
 * are active, the maximum token limit, and content-policy settings.
 */
export interface GuardrailConfig {
  /** Filter names to enable. Omit or pass empty array to enable all registered filters. */
  filters?: string[];

  /** Maximum allowed token count (rough whitespace-split estimate) */
  maxTokens?: number;

  /** Blocked keywords for content-policy filter */
  blockedKeywords?: string[];

  /** Whether to short-circuit the pipeline on the first blocking violation (default: true) */
  shortCircuit?: boolean;
}
