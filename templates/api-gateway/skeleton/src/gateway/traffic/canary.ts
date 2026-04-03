// ── Canary Traffic Splitting ─────────────────────────────────────────
//
// Percentage-based traffic splitting between a primary and canary
// upstream. Each request is independently routed — no sticky sessions.
// Uses Math.random for simplicity; replace with a deterministic hash
// if session affinity is needed.
//

import type { CanaryConfig } from "../types.js";

/**
 * Select an upstream URL based on the canary percentage. Returns the
 * canary URL for `canaryPercent` of requests and the primary URL for
 * the remainder.
 *
 * @example
 * ```ts
 * const url = selectUpstream({
 *   primary: "http://v1:3001",
 *   canary: "http://v2:3001",
 *   canaryPercent: 10,
 * });
 * // ~10% of calls return "http://v2:3001"
 * ```
 */
export function selectUpstream(config: CanaryConfig): string {
  if (config.canaryPercent <= 0) return config.primary;
  if (config.canaryPercent >= 100) return config.canary;

  const roll = Math.random() * 100;
  return roll < config.canaryPercent ? config.canary : config.primary;
}

/**
 * Determine whether a route's upstream configuration includes a canary
 * split. Returns true if the upstream is a CanaryConfig object.
 */
export function isCanaryConfig(upstream: unknown): upstream is CanaryConfig {
  return (
    typeof upstream === "object" &&
    upstream !== null &&
    "primary" in upstream &&
    "canary" in upstream &&
    "canaryPercent" in upstream
  );
}
