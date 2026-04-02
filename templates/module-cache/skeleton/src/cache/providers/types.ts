// ── Cache Provider Interface ────────────────────────────────────────
//
// All cache providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerProvider() at the module level.
//

import type { CacheConfig } from "../types.js";

export interface CacheProvider {
  /** Unique provider name (e.g. "memory", "redis", "memcached"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: CacheConfig): Promise<void>;

  /** Retrieve a value by key. Returns undefined if not found or expired. */
  get(key: string): Promise<string | undefined>;

  /** Store a value with an optional TTL in milliseconds. */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /** Delete a key from the cache. */
  delete(key: string): Promise<void>;

  /** Check whether a key exists and has not expired. */
  has(key: string): Promise<boolean>;

  /** Remove all entries from the cache. */
  clear(): Promise<void>;

  /** Gracefully shut down the provider, releasing connections. */
  close(): Promise<void>;
}
