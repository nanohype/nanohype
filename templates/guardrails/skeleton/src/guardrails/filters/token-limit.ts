// ── Token Limit Filter ───────────────────────────────────────────────
//
// Guards against excessively long inputs or outputs. Uses a rough
// whitespace-split token estimate. The limit is configurable via
// GuardrailConfig.maxTokens.

import type { Filter } from "./types.js";
import type { Direction, FilterResult, Violation } from "../types.js";
import { registerFilter } from "./registry.js";

/**
 * Default maximum token count. Override by passing `maxTokens`
 * in the GuardrailConfig when creating the pipeline.
 */
let maxTokens = 4096;

/**
 * Configure the maximum token limit. Call this before creating
 * the pipeline to set a custom limit.
 */
export function setMaxTokens(limit: number): void {
  maxTokens = limit;
}

/**
 * Get the current max token limit.
 */
export function getMaxTokens(): number {
  return maxTokens;
}

/**
 * Rough token count estimate using whitespace splitting.
 * This is intentionally simple — production systems should use
 * a proper tokenizer (tiktoken, etc.) for accurate counts.
 */
export function estimateTokens(text: string): number {
  return text.split(/\s+/).filter((t) => t.length > 0).length;
}

export const tokenLimitFilter: Filter = {
  name: "token-limit",

  filter(input: string, _direction: Direction): FilterResult {
    const tokenCount = estimateTokens(input);
    const violations: Violation[] = [];

    if (tokenCount > maxTokens) {
      violations.push({
        filter: "token-limit",
        message: `Token count ${tokenCount} exceeds maximum ${maxTokens}`,
        severity: "block",
      });
    }

    return {
      allowed: violations.length === 0,
      filtered: input,
      violations,
    };
  },
};

// Self-register when this module is imported
registerFilter(tokenLimitFilter);
