import type { RateLimitResult } from "../types.js";
import type { RateLimitStore } from "../stores/types.js";
import type { RateLimitAlgorithm } from "./types.js";
import { registerAlgorithm } from "./registry.js";

// ── Fixed Window Counter Algorithm ─────────────────────────────────
//
// Divides time into fixed-size windows and maintains a counter per
// window. Simple and storage-efficient — one key per window period.
// The trade-off is that bursts at window boundaries can exceed the
// intended limit (up to 2x in the worst case).
//

function counterKey(key: string, windowId: number): string {
  return `fw:${key}:${windowId}`;
}

function windowId(now: number, window: number): number {
  return Math.floor(now / window);
}

const fixedWindow: RateLimitAlgorithm = {
  name: "fixed-window",

  async check(
    key: string,
    limit: number,
    window: number,
    store: RateLimitStore,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const currentWindow = windowId(now, window);
    const ck = counterKey(key, currentWindow);

    // Increment counter for the current window
    const count = await store.increment(ck, window);
    const resetAt = (currentWindow + 1) * window;

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
      };
    }

    return {
      allowed: true,
      remaining: limit - count,
      resetAt,
      limit,
    };
  },

  async reset(key: string, store: RateLimitStore): Promise<void> {
    const now = Date.now();
    // Clean up a reasonable range of recent windows
    for (let i = 0; i < 10; i++) {
      const wid = windowId(now, 60_000) - i;
      await store.delete(counterKey(key, wid));
    }
  },
};

// Self-register
registerAlgorithm(fixedWindow);
