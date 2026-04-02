// ── Cache Core Types ────────────────────────────────────────────────
//
// Shared interfaces for cache entries, configuration, and the
// top-level cache facade. These are provider-agnostic — every backend
// implementation works against the same shapes.
//

/** A cached value with optional metadata. */
export interface CacheEntry<T = unknown> {
  /** The cached value. */
  value: T;

  /** ISO-8601 timestamp of when the entry was stored. */
  createdAt: string;

  /** TTL in milliseconds. Undefined means no expiration. */
  ttl?: number;

  /** ISO-8601 timestamp of when the entry expires. Undefined means no expiration. */
  expiresAt?: string;
}

/** Configuration passed to createCache. */
export interface CacheConfig {
  /** Provider-specific connection or configuration options. */
  [key: string]: unknown;
}

/** Options for a cache set operation. */
export interface SetOptions {
  /** Time-to-live in milliseconds. Omit for no expiration. */
  ttl?: number;
}
