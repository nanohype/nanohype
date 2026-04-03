import type { GatewayResponse } from "../types.js";
import type { CachingStrategy, CacheContext, CachedResponse } from "./types.js";
import { registerCachingStrategy } from "./registry.js";

// Re-export so existing imports from "./hash.js" keep working
export { computeCacheKey } from "./key.js";

// ── Hash Caching Strategy ───────────────────────────────────────────
//
// SHA-256 of model + prompt + JSON(params) as the cache key. Fixed
// TTL (default 1 hour). In-memory Map store. Entries are evicted
// lazily on access when their TTL expires.
//

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  cached: CachedResponse;
  expiresAt: number;
}

export function createHashStrategy(): CachingStrategy {
  const store = new Map<string, CacheEntry>();

  return {
    name: "hash",

    async get(key: string, _context: CacheContext): Promise<CachedResponse | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;

      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }

      return entry.cached;
    },

    async set(key: string, response: GatewayResponse, context: CacheContext): Promise<void> {
      const ttl = context.ttl ?? DEFAULT_TTL_MS;
      const cached: CachedResponse = {
        response: { ...response, cached: true },
        cachedAt: new Date().toISOString(),
      };
      store.set(key, { cached, expiresAt: Date.now() + ttl });
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
registerCachingStrategy("hash", createHashStrategy);
