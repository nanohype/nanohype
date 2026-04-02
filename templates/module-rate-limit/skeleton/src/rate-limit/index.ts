// ── Module Rate Limit — Main Exports ────────────────────────────────
//
// Public API for the rate limiting module. Import algorithms and stores
// so they self-register, then expose createRateLimiter as the primary
// entry point.
//
// Default algorithm: __ALGORITHM__
// Default store: __STORE__
//

import { getAlgorithm, listAlgorithms } from "./algorithms/index.js";
import { getStore, listStores } from "./stores/index.js";
import type { RateLimitAlgorithm } from "./algorithms/types.js";
import type { RateLimitStore, StoreConfig } from "./stores/types.js";
import type { RateLimitOptions, RateLimitResult } from "./types.js";

// Re-export everything consumers need
export { honoMiddleware, expressMiddleware } from "./middleware.js";
export type { MiddlewareOptions } from "./middleware.js";
export { getAlgorithm, listAlgorithms, registerAlgorithm } from "./algorithms/index.js";
export { getStore, listStores, registerStore } from "./stores/index.js";
export type { RateLimitAlgorithm } from "./algorithms/types.js";
export type { RateLimitStore, StoreConfig } from "./stores/types.js";
export type { RateLimitConfig, RateLimitResult, RateLimitOptions } from "./types.js";

// ── Rate Limiter Facade ────────────────────────────────────────────

/** Default options applied when not specified by the caller. */
const DEFAULTS: Required<RateLimitOptions> = {
  limit: 100,
  window: 60_000,
  keyPrefix: "",
};

export interface RateLimiter {
  /** The underlying algorithm instance. */
  algorithm: RateLimitAlgorithm;

  /** The underlying store instance. */
  store: RateLimitStore;

  /** Check whether a request identified by `key` is allowed. */
  check(key: string): Promise<RateLimitResult>;

  /** Reset rate limit state for the given key. */
  reset(key: string): Promise<void>;

  /** Shut down the store and release resources. */
  close(): Promise<void>;
}

/**
 * Create a configured rate limiter that wires an algorithm and store
 * together.
 *
 * Both the algorithm and store must already be registered (built-in
 * implementations self-register on import via the barrel modules).
 *
 *   const limiter = await createRateLimiter();
 *   const result = await limiter.check("user:123");
 *   if (!result.allowed) { // reject }
 */
export async function createRateLimiter(
  algorithmName: string = "__ALGORITHM__",
  storeName: string = "__STORE__",
  opts?: RateLimitOptions,
  storeConfig?: StoreConfig,
): Promise<RateLimiter> {
  const limit = opts?.limit ?? DEFAULTS.limit;
  const window = opts?.window ?? DEFAULTS.window;
  const keyPrefix = opts?.keyPrefix ?? DEFAULTS.keyPrefix;

  const algorithm = getAlgorithm(algorithmName);
  const store = getStore(storeName);
  await store.init(storeConfig ?? {});

  function prefixed(key: string): string {
    return keyPrefix ? `${keyPrefix}${key}` : key;
  }

  return {
    algorithm,
    store,

    async check(key: string): Promise<RateLimitResult> {
      return algorithm.check(prefixed(key), limit, window, store);
    },

    async reset(key: string): Promise<void> {
      return algorithm.reset(prefixed(key), store);
    },

    async close(): Promise<void> {
      await store.close();
    },
  };
}
