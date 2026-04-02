import type { RateLimitResult } from "../types.js";
import type { RateLimitStore } from "../stores/types.js";
import type { RateLimitAlgorithm } from "./types.js";
import { registerAlgorithm } from "./registry.js";

// ── Token Bucket Algorithm ─────────────────────────────────────────
//
// Classic token bucket: tokens are added at a steady rate (limit per
// window). Each request consumes one token. When the bucket is empty
// the request is rejected. State is persisted as two keys per
// identifier — the current token count and the last refill timestamp.
//

function tokensKey(key: string): string {
  return `tb:${key}:tokens`;
}

function tsKey(key: string): string {
  return `tb:${key}:ts`;
}

const tokenBucket: RateLimitAlgorithm = {
  name: "token-bucket",

  async check(
    key: string,
    limit: number,
    window: number,
    store: RateLimitStore,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const refillRate = limit / window; // tokens per millisecond

    // Read current state from store
    const [storedTokens, storedTs] = await Promise.all([
      store.get(tokensKey(key)),
      store.get(tsKey(key)),
    ]);

    let tokens: number;
    let lastRefill: number;

    if (storedTokens === null || storedTs === null) {
      // First request — start with a full bucket minus one token
      tokens = limit - 1;
      lastRefill = now;

      await Promise.all([
        store.set(tokensKey(key), String(tokens), window),
        store.set(tsKey(key), String(lastRefill), window),
      ]);

      return {
        allowed: true,
        remaining: tokens,
        resetAt: now + window,
        limit,
      };
    }

    lastRefill = parseInt(storedTs, 10);
    tokens = parseFloat(storedTokens);

    // Refill tokens based on elapsed time
    const elapsed = now - lastRefill;
    const refill = elapsed * refillRate;
    tokens = Math.min(limit, tokens + refill);
    lastRefill = now;

    if (tokens < 1) {
      // Not enough tokens — reject
      const resetAt = lastRefill + Math.ceil((1 - tokens) / refillRate);

      await Promise.all([
        store.set(tokensKey(key), String(tokens), window),
        store.set(tsKey(key), String(lastRefill), window),
      ]);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
      };
    }

    // Consume one token
    tokens -= 1;

    await Promise.all([
      store.set(tokensKey(key), String(tokens), window),
      store.set(tsKey(key), String(lastRefill), window),
    ]);

    return {
      allowed: true,
      remaining: Math.floor(tokens),
      resetAt: now + window,
      limit,
    };
  },

  async reset(key: string, store: RateLimitStore): Promise<void> {
    await Promise.all([
      store.delete(tokensKey(key)),
      store.delete(tsKey(key)),
    ]);
  },
};

// Self-register
registerAlgorithm(tokenBucket);
