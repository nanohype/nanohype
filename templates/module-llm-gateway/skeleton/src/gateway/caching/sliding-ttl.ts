import type { GatewayResponse } from "../types.js";
import type { CachingStrategy, CacheContext, CachedResponse } from "./types.js";
import { registerCachingStrategy } from "./registry.js";

// Re-export so existing imports from "./sliding-ttl.js" keep working
export { computeCacheKey } from "./key.js";

// ── Sliding-TTL Caching Strategy ────────────────────────────────────
//
// Same SHA-256 cache key as the hash strategy. The difference is
// that TTL extends on each cache hit — frequently accessed entries
// stay cached longer. In-memory Map store with lazy expiration and a
// MAX_ENTRIES cap: a hit re-inserts the key (moving it to the end of
// the insertion order), so eviction on set() drops the least-recently
// used entry rather than the most popular one.
//

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = Number(process.env.GATEWAY_CACHE_MAX_ENTRIES ?? 10_000);

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

      // Extend TTL on hit and mark as most-recently used by re-inserting.
      entry.expiresAt = Date.now() + entry.ttlMs;
      store.delete(key);
      store.set(key, entry);
      return entry.cached;
    },

    async set(key: string, response: GatewayResponse, context: CacheContext): Promise<void> {
      const ttl = context.ttl ?? DEFAULT_TTL_MS;
      const cached: CachedResponse = {
        response: { ...response, cached: true },
        cachedAt: new Date().toISOString(),
      };
      store.delete(key);
      store.set(key, { cached, ttlMs: ttl, expiresAt: Date.now() + ttl });

      // Bound the store: evict the least-recently-used entry over the cap.
      while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
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
