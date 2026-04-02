// ── Content Policy Filter ────────────────────────────────────────────
//
// Keyword and pattern-based content policy enforcement. Configurable
// via a deny list of blocked keywords. Scans both input and output
// for policy violations.

import type { Filter } from "./types.js";
import type { Direction, FilterResult, Violation } from "../types.js";
import { registerFilter } from "./registry.js";

/**
 * Default blocked keywords. Override by passing `blockedKeywords`
 * in the GuardrailConfig when creating the pipeline.
 */
let blockedKeywords: string[] = [];

/**
 * Configure the content policy filter with a list of blocked keywords.
 * Call this before creating the pipeline to customize the deny list.
 */
export function setBlockedKeywords(keywords: string[]): void {
  blockedKeywords = keywords.map((k) => k.toLowerCase());
}

/**
 * Get the current list of blocked keywords.
 */
export function getBlockedKeywords(): string[] {
  return [...blockedKeywords];
}

export const contentPolicyFilter: Filter = {
  name: "content-policy",

  filter(input: string, _direction: Direction): FilterResult {
    const violations: Violation[] = [];
    const lower = input.toLowerCase();

    for (const keyword of blockedKeywords) {
      if (lower.includes(keyword)) {
        violations.push({
          filter: "content-policy",
          message: `Content contains blocked keyword: "${keyword}"`,
          severity: "block",
        });
      }
    }

    return {
      allowed: violations.length === 0,
      filtered: input,
      violations,
    };
  },
};

// Self-register when this module is imported
registerFilter(contentPolicyFilter);
