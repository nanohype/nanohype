// ── Flag Evaluator ──────────────────────────────────────────────────
//
// Evaluates a flag against a targeting context. Rules are checked in
// order — first match wins. Supports three rule types:
//
//   percentage  — deterministic bucketing via fnv1a hash of
//                 `flagKey:userId`, ensures the same user always
//                 sees the same variant for a given flag.
//   allowlist   — explicit user ID list, bypasses percentage logic.
//   property    — compares a context property against a value using
//                 standard comparison operators.
//
// Returns an EvaluationResult with the resolved variant, value, and
// the reason for the outcome (rule_match, default, disabled, etc.).
//

import type {
  Flag,
  TargetingContext,
  EvaluationResult,
  Rule,
  RuleOperator,
} from "./types.js";

// ── FNV-1a Hash ─────────────────────────────────────────────────────
//
// Deterministic 32-bit hash for percentage rollout bucketing. FNV-1a
// is fast, well-distributed, and produces consistent results across
// runs — no external dependencies required.
//

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Hash a flag key and user ID to a bucket in [0, 100).
 * Deterministic: same inputs always produce the same bucket.
 */
function hashToBucket(flagKey: string, userId: string): number {
  const hash = fnv1a(`${flagKey}:${userId}`);
  return hash % 100;
}

// ── Property Comparison ─────────────────────────────────────────────

function compareProperty(
  actual: unknown,
  operator: RuleOperator,
  expected: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    default:
      return false;
  }
}

// ── Rule Matching ───────────────────────────────────────────────────

function matchesRule(rule: Rule, flagKey: string, context: TargetingContext): boolean {
  switch (rule.type) {
    case "percentage": {
      if (!context.userId || rule.percentage === undefined) return false;
      const bucket = hashToBucket(flagKey, context.userId);
      return bucket < rule.percentage;
    }

    case "allowlist": {
      if (!context.userId || !rule.userIds) return false;
      return rule.userIds.includes(context.userId);
    }

    case "property": {
      if (!context.properties || !rule.property || !rule.operator) return false;
      const actual = context.properties[rule.property];
      if (actual === undefined) return false;
      return compareProperty(actual, rule.operator, rule.compareValue);
    }

    default:
      return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Evaluate a flag against a targeting context.
 *
 * Returns the resolved variant name and value. If the flag is
 * disabled, returns the default variant. If no rules match, returns
 * the default variant. If the flag is not found, returns a not_found
 * result.
 */
export function evaluate(flag: Flag, context: TargetingContext): EvaluationResult {
  if (!flag.enabled) {
    const variant = flag.variants.find((v) => v.name === flag.defaultVariant);
    return {
      flagKey: flag.key,
      variant: flag.defaultVariant,
      value: variant?.value ?? null,
      enabled: false,
      reason: "disabled",
    };
  }

  for (let i = 0; i < flag.rules.length; i++) {
    const rule = flag.rules[i];
    if (matchesRule(rule, flag.key, context)) {
      const variant = flag.variants.find((v) => v.name === rule.variant);
      return {
        flagKey: flag.key,
        variant: rule.variant,
        value: variant?.value ?? null,
        enabled: true,
        reason: "rule_match",
        ruleIndex: i,
      };
    }
  }

  const variant = flag.variants.find((v) => v.name === flag.defaultVariant);
  return {
    flagKey: flag.key,
    variant: flag.defaultVariant,
    value: variant?.value ?? null,
    enabled: true,
    reason: "default",
  };
}

/**
 * Create a not-found evaluation result for missing flags.
 */
export function notFoundResult(flagKey: string): EvaluationResult {
  return {
    flagKey,
    variant: "",
    value: null,
    enabled: false,
    reason: "not_found",
  };
}
