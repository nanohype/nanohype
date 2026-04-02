import type { RateLimitResult } from "../types.js";
import type { RateLimitStore } from "../stores/types.js";
import type { RateLimitAlgorithm } from "./types.js";
import { registerAlgorithm } from "./registry.js";

// ── Sliding Window Log Algorithm ───────────────────────────────────
//
// Maintains a log of request timestamps within the current window.
// On each check, expired entries are pruned and the count of remaining
// entries determines whether the request is allowed. Provides the
// most accurate rate limiting but uses more storage per key.
//

function listKey(key: string): string {
  return `sw:${key}:log`;
}

const slidingWindow: RateLimitAlgorithm = {
  name: "sliding-window",

  async check(
    key: string,
    limit: number,
    window: number,
    store: RateLimitStore,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - window;

    // Get all timestamps in the log
    const entries = await store.getList(listKey(key));

    // Filter to only entries within the current window
    const active = entries.filter((ts) => parseInt(ts, 10) > windowStart);

    if (active.length >= limit) {
      // At or over limit — find when the oldest entry expires
      const oldest = parseInt(active[0]!, 10);
      const resetAt = oldest + window;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
      };
    }

    // Allowed — clear and rewrite the list with pruned entries + new timestamp
    await store.delete(listKey(key));
    for (const ts of active) {
      await store.appendList(listKey(key), ts, window);
    }
    await store.appendList(listKey(key), String(now), window);

    return {
      allowed: true,
      remaining: limit - active.length - 1,
      resetAt: now + window,
      limit,
    };
  },

  async reset(key: string, store: RateLimitStore): Promise<void> {
    await store.delete(listKey(key));
  },
};

// Self-register
registerAlgorithm(slidingWindow);
