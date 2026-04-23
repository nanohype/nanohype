// ── Rate Limit Algorithm Interface ──────────────────────────────────
//
// All rate limiting algorithms implement this interface. The registry
// pattern allows new algorithms to be added by importing an algorithm
// module that calls registerAlgorithm() at the module level.
//

import type { RateLimitResult } from "../types.js";
import type { RateLimitStore } from "../stores/types.js";

/**
 * Contract that all rate limiting algorithms must implement. Each
 * algorithm uses a store for state persistence and applies its own
 * strategy for counting and limiting requests.
 */
export interface RateLimitAlgorithm {
  /** Unique algorithm name (e.g. "token-bucket", "sliding-window", "fixed-window"). */
  readonly name: string;

  /**
   * Check whether a request identified by `key` is allowed under the
   * given `limit` and `window` (in milliseconds). Uses the provided
   * store for state persistence.
   */
  check(
    key: string,
    limit: number,
    window: number,
    store: RateLimitStore,
  ): Promise<RateLimitResult>;

  /**
   * Reset rate limit state for the given key. Clears all counters,
   * tokens, and timestamps associated with the key.
   */
  reset(key: string, store: RateLimitStore): Promise<void>;
}
