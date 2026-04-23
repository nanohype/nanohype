// ── Feature Flag Core Types ─────────────────────────────────────────
//
// Shared interfaces for flags, variants, rules, targeting contexts,
// and evaluation results. These are store-agnostic — every backend
// implementation works against the same shapes.
//

/** The type of value a flag resolves to. */
export type FlagType = "boolean" | "string" | "number" | "json";

/** A named variant within a flag (e.g., "control", "treatment-a"). */
export interface Variant {
  /** Unique variant identifier within the flag. */
  name: string;

  /** The value this variant resolves to. */
  value: unknown;

  /** Optional weight for percentage-based rollout (0–100). */
  weight?: number;
}

/** Operators for property-based targeting rules. */
export type RuleOperator = "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte";

/** A single targeting rule that determines flag eligibility. */
export interface Rule {
  /** Rule type: percentage rollout, user allowlist, or property match. */
  type: "percentage" | "allowlist" | "property";

  /** For percentage rules: rollout percentage (0–100). */
  percentage?: number;

  /** For allowlist rules: list of user IDs that receive the flag. */
  userIds?: string[];

  /** For property rules: the context property name to match against. */
  property?: string;

  /** For property rules: the comparison operator. */
  operator?: RuleOperator;

  /** For property rules: the value to compare against. */
  compareValue?: unknown;

  /** The variant to serve when this rule matches. */
  variant: string;
}

/** A feature flag definition. */
export interface Flag {
  /** Unique flag key (e.g., "new-checkout-flow"). */
  key: string;

  /** Human-readable flag name. */
  name: string;

  /** Optional description of what this flag controls. */
  description?: string;

  /** Whether the flag is active. Inactive flags return the default variant. */
  enabled: boolean;

  /** The type of value this flag resolves to. */
  type: FlagType;

  /** Available variants for this flag. */
  variants: Variant[];

  /** Ordered targeting rules. First match wins. */
  rules: Rule[];

  /** The variant to return when no rules match or the flag is disabled. */
  defaultVariant: string;

  /** ISO-8601 timestamp of when the flag was created. */
  createdAt: string;

  /** ISO-8601 timestamp of when the flag was last updated. */
  updatedAt: string;
}

/** Context provided during flag evaluation for targeting decisions. */
export interface TargetingContext {
  /** The user ID for percentage hashing and allowlist checks. */
  userId?: string;

  /** Arbitrary properties for property-based rule matching. */
  properties?: Record<string, unknown>;
}

/** The result of evaluating a flag for a given context. */
export interface EvaluationResult {
  /** The flag key that was evaluated. */
  flagKey: string;

  /** The resolved variant name. */
  variant: string;

  /** The resolved value from the matched variant. */
  value: unknown;

  /** Whether the flag was found and enabled. */
  enabled: boolean;

  /** The reason for this evaluation outcome. */
  reason: "rule_match" | "default" | "disabled" | "not_found" | "error";

  /** Which rule index matched (if reason is rule_match). */
  ruleIndex?: number;
}

/** Configuration for the flag service. */
export interface FlagServiceConfig {
  /** The name of the flag store to use. */
  storeName?: string;

  /** Store-specific configuration options. */
  storeConfig?: Record<string, unknown>;

  /** Whether to enable variant tracking. Default: true. */
  enableTracking?: boolean;
}
