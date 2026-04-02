// ── PII Detection Filter ─────────────────────────────────────────────
//
// Regex-based detection and redaction of personally identifiable
// information. Scans for email addresses, phone numbers, Social
// Security numbers, and credit card numbers. Replaces detected PII
// with redaction placeholders.

import type { Filter } from "./types.js";
import type { Direction, FilterResult, Violation } from "../types.js";
import { registerFilter } from "./registry.js";

/**
 * PII patterns with their redaction labels. Each entry has a regex,
 * a category name, and the replacement text used for redaction.
 */
const PII_PATTERNS: { pattern: RegExp; category: string; replacement: string }[] = [
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    category: "email",
    replacement: "[EMAIL_REDACTED]",
  },
  {
    // US phone formats: (555) 123-4567, 555-123-4567, 555.123.4567, +1-555-123-4567
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    category: "phone",
    replacement: "[PHONE_REDACTED]",
  },
  {
    // SSN: 123-45-6789 or 123 45 6789
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    category: "ssn",
    replacement: "[SSN_REDACTED]",
  },
  {
    // Credit card: 4 groups of 4 digits separated by spaces or dashes
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    category: "credit-card",
    replacement: "[CC_REDACTED]",
  },
];

export const piiFilter: Filter = {
  name: "pii",

  filter(input: string, direction: Direction): FilterResult {
    const violations: Violation[] = [];
    let filtered = input;

    for (const { pattern, category, replacement } of PII_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;

      const matches = input.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            filter: "pii",
            message: `Detected ${category}: ${match.slice(0, 4)}****`,
            severity: direction === "output" ? "block" : "warn",
          });
        }
        filtered = filtered.replace(pattern, replacement);
      }
    }

    return {
      allowed: violations.filter((v) => v.severity === "block").length === 0,
      filtered,
      violations,
    };
  },
};

// Self-register when this module is imported
registerFilter(piiFilter);
