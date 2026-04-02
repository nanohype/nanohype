// ── Guardrails Module ────────────────────────────────────────────────
//
// Main entry point for the __PROJECT_NAME__ guardrails module.
//
// Usage:
//   import { createGuardrail } from "__PROJECT_NAME__";
//
//   const guard = createGuardrail({ maxTokens: 2048 });
//   const result = guard("user message", "input");
//
// All built-in filters (prompt-injection, pii, content-policy,
// token-limit) are registered at import time. To add a custom filter,
// import `registerFilter` from the filters sub-module and register
// your own Filter implementation.

import { validateBootstrap } from "./bootstrap.js";
import type { Direction, FilterResult, GuardrailConfig } from "./types.js";
import { createPipeline } from "./pipeline.js";
import { setMaxTokens } from "./filters/token-limit.js";
import { setBlockedKeywords } from "./filters/content-policy.js";

// Trigger self-registration of all built-in filters
import "./filters/index.js";

// Re-export core types
export type { FilterResult, GuardrailConfig, Violation, Direction } from "./types.js";

// Re-export filter utilities for custom filter registration
export { registerFilter, getFilter, listFilters } from "./filters/index.js";
export type { Filter } from "./filters/types.js";

// Re-export pipeline
export { createPipeline } from "./pipeline.js";

/**
 * Create a guardrail function from the given configuration. This is
 * the main API surface — it configures the built-in filters and
 * returns a function that runs content through the filter pipeline.
 *
 * @example
 * ```ts
 * const guard = createGuardrail({ maxTokens: 2048 });
 * const result = guard("user message", "input");
 * if (!result.allowed) {
 *   console.log("Blocked:", result.violations);
 * }
 * ```
 */
export function createGuardrail(
  config: GuardrailConfig = {},
): (input: string, direction: Direction) => FilterResult {
  validateBootstrap();

  // Apply configuration to configurable filters
  if (config.maxTokens !== undefined) {
    setMaxTokens(config.maxTokens);
  }
  if (config.blockedKeywords !== undefined) {
    setBlockedKeywords(config.blockedKeywords);
  }

  return createPipeline(config);
}
