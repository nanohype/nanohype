import type { GatewayResponse } from "../types.js";
import type { CachingStrategy, CacheContext, CachedResponse } from "./types.js";
import { registerCachingStrategy } from "./registry.js";

// Re-export so existing imports from "./sliding-ttl.js" keep working
export { computeCacheKey } from "./key.js";

// ── Sliding-TTL Caching Strategy ────────────────────────────────────
//
// Same SHA-256 cache key as the hash strategy. The difference is
// that TTL extends on each cache hit — frequently accessed entries
// stay cached longer. In-memory Map store with lazy expiration.
//

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  cached: CachedResponse;
  ttlMs: number;
  expiresAt: number;
}

export function createSlidingTtlStrategy(): CachingStrategy {
  const store = new Map<string, CacheEntry>();

  return {
    name: "sliding-ttl",

    async get(key: string, _context: CacheContext): Promise<CachedResponse | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;

      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }

      // Extend TTL on hit
      entry.expiresAt = Date.now() + entry.ttlMs;
      return entry.cached;
    },

    async set(key: string, response: GatewayResponse, context: CacheContext): Promise<void> {
      const ttl = context.ttl ?? DEFAULT_TTL_MS;
      const cached: CachedResponse = {
        response: { ...response, cached: true },
        cachedAt: new Date().toISOString(),
      };
      store.set(key, { cached, ttlMs: ttl, expiresAt: Date.now() + ttl });
    },

    async invalidate(key: string): Promise<void> {
      store.delete(key);
    },

    async close(): Promise<void> {
      store.clear();
    },
  };
}

// Self-register
registerCachingStrategy("sliding-ttl", createSlidingTtlStrategy);
