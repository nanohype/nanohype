// ── Rate Limit Core Types ──────────────────────────────────────────
//
// Shared interfaces for rate limiting configuration, results, and
// options. These are algorithm-agnostic — every algorithm and store
// implementation works against the same shapes.
//

/** Configuration for a rate limiter instance. */
export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  limit: number;

  /** Time window in milliseconds. */
  window: number;

  /** Algorithm-specific or store-specific options. */
  [key: string]: unknown;
}

/** Result of a rate limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed through. */
  allowed: boolean;

  /** Number of requests remaining in the current window. */
  remaining: number;

  /** Unix timestamp (ms) when the rate limit window resets. */
  resetAt: number;

  /** The configured limit for reference. */
  limit: number;
}

/** Options passed to the rate limiter facade. */
export interface RateLimitOptions {
  /** Maximum requests per window (default: 100). */
  limit?: number;

  /** Window duration in milliseconds (default: 60000 — one minute). */
  window?: number;

  /** Key prefix for namespacing rate limit entries. */
  keyPrefix?: string;
}
