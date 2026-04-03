// ── Per-Route Token Bucket Rate Limiter ─────────────────────────────
//
// In-memory token bucket rate limiting with per-route isolation. Each
// route rule with a rateLimit config gets its own bucket map keyed by
// client IP. Buckets are instance-scoped — no module-level mutable
// state. The factory creates a self-contained limiter for each route.
//
// Token bucket algorithm: tokens replenish at a steady rate. Each
// request consumes one token. When the bucket is empty, requests
// are rejected with 429 and standard rate limit response headers.
//

import type { Context, Next } from "hono";
import type { RateLimitRule } from "../types.js";

/** State for a single client's token bucket. */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

/** Per-route rate limiter instance. All state is instance-scoped. */
export interface RouteLimiter {
  /** Check whether a request from `key` is allowed. */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number };

  /** Reset the bucket for a given key. */
  reset(key: string): void;

  /** Clear all buckets (for cleanup). */
  clear(): void;
}

/**
 * Create a rate limiter for a single route. Returns instance-scoped
 * state — no shared mutable module-level data.
 */
export function createRouteLimiter(rule: RateLimitRule): RouteLimiter {
  const buckets = new Map<string, Bucket>();
  const { limit, window } = rule;
  const windowMs = window * 1000;

  function refill(bucket: Bucket, now: number): void {
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / windowMs) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  return {
    check(key: string) {
      const now = Date.now();
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { tokens: limit, lastRefill: now };
        buckets.set(key, bucket);
      }

      refill(bucket, now);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return {
          allowed: true,
          remaining: Math.floor(bucket.tokens),
          resetAt: now + windowMs,
        };
      }

      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.lastRefill + windowMs,
      };
    },

    reset(key: string) {
      buckets.delete(key);
    },

    clear() {
      buckets.clear();
    },
  };
}

/**
 * Extract a rate-limit key from a Hono context. Uses X-Forwarded-For
 * when present, falls back to the connected IP.
 */
function extractKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

/**
 * Create a Hono middleware that enforces token bucket rate limiting.
 * Each invocation gets its own limiter instance — no shared state
 * between routes.
 */
export function createRateLimitMiddleware(
  rule: RateLimitRule,
): (c: Context, next: Next) => Promise<Response | void> {
  const limiter = createRouteLimiter(rule);

  return async (c: Context, next: Next) => {
    const key = extractKey(c);
    const result = limiter.check(key);

    c.header("X-RateLimit-Limit", String(rule.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too Many Requests", retryAfter },
        429,
      );
    }

    await next();
  };
}
