// ── Prompt Injection Filter ──────────────────────────────────────────
//
// Detects common prompt injection patterns in user input. Checks for
// attempts to override system instructions, leak system prompts, or
// manipulate the LLM's behavior through adversarial input.

import type { Filter } from "./types.js";
import type { Direction, FilterResult, Violation } from "../types.js";
import { registerFilter } from "./registry.js";

/**
 * Patterns that indicate a prompt injection attempt. Each entry has a
 * regex and a human-readable description for the violation message.
 */
const INJECTION_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    description: "Attempt to override previous instructions",
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    description: "Attempt to disregard previous instructions",
  },
  {
    pattern: /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    description: "Attempt to forget previous instructions",
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|the)\s+/i,
    description: "Attempt to reassign AI identity",
  },
  {
    pattern: /act\s+as\s+(a|an|if)\s+/i,
    description: "Attempt to reassign AI role",
  },
  {
    pattern: /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
    description: "Attempt to extract system prompt",
  },
  {
    pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
    description: "Attempt to extract system prompt",
  },
  {
    pattern: /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
    description: "Attempt to extract system prompt",
  },
  {
    pattern: /\[system\]|\[INST\]|<\|im_start\|>|<\|system\|>/i,
    description: "Injection of system-level delimiters",
  },
  {
    pattern: /ADMIN\s+MODE|DEVELOPER\s+MODE|DAN\s+MODE|JAILBREAK/i,
    description: "Attempt to activate privileged mode",
  },
];

export const promptInjectionFilter: Filter = {
  name: "prompt-injection",

  filter(input: string, direction: Direction): FilterResult {
    // Only scan user input — LLM output is not an injection vector
    if (direction === "output") {
      return { allowed: true, filtered: input, violations: [] };
    }

    const violations: Violation[] = [];

    for (const { pattern, description } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        violations.push({
          filter: "prompt-injection",
          message: description,
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
registerFilter(promptInjectionFilter);
