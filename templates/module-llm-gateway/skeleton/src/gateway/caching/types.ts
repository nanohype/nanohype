// ── Caching Strategy Interface ──────────────────────────────────────
//
// All caching strategies implement this interface. The registry
// pattern allows new strategies to be added by importing a strategy
// module that calls registerCachingStrategy() at the module level.
//
// All methods return Promises because caching strategies may need
// I/O (Redis, vector search, external stores).
//

import type { GatewayResponse } from "../types.js";

/** Context for cache key generation and TTL decisions. */
export interface CacheContext {
  /** The prompt text (combined user messages). */
  prompt: string;
  /** The model name. */
  model: string;
  /** Additional parameters that affect output (temperature, etc.). */
  params: Record<string, unknown>;
  /** TTL override in milliseconds. */
  ttl?: number;
}

/** A cached response with metadata. */
export interface CachedResponse {
  /** The cached gateway response. */
  response: GatewayResponse;
  /** ISO-8601 timestamp of when the entry was stored. */
  cachedAt: string;
}

export interface CachingStrategy {
  /** Unique strategy name (e.g. "hash", "sliding-ttl", "none"). */
  readonly name: string;

  /** Retrieve a cached response by key. Returns undefined on miss. */
  get(key: string, context: CacheContext): Promise<CachedResponse | undefined>;

  /** Store a response in the cache. */
  set(key: string, response: GatewayResponse, context: CacheContext): Promise<void>;

  /** Invalidate a specific cache entry. */
  invalidate(key: string): Promise<void>;

  /** Release resources held by the caching strategy. */
  close(): Promise<void>;
}
