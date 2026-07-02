import type { GatewayResponse } from "../types.js";
import type {
  CachingStrategy,
  CachingStrategyOptions,
  CacheContext,
  CachedResponse,
} from "./types.js";
import { registerCachingStrategy } from "./registry.js";

// Re-export so existing imports from "./hash.js" keep working
export { computeCacheKey } from "./key.js";

// ── Hash Caching Strategy ───────────────────────────────────────────
//
// SHA-256 of model + prompt + JSON(params) as the cache key. Fixed
// TTL (default 1 hour). In-memory Map store. Entries are evicted
// lazily on access when their TTL expires, and the store is bounded
// to MAX_ENTRIES — the oldest-inserted entry is evicted on set() when
// the cap is reached, so an unbounded prompt space can't leak memory.
//

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = Number(process.env.GATEWAY_CACHE_MAX_ENTRIES ?? 10_000);

interface CacheEntry {
  cached: CachedResponse;
  expiresAt: number;
}

export function createHashStrategy(options: CachingStrategyOptions = {}): CachingStrategy {
  const now = options.now ?? Date.now;
  const store = new Map<string, CacheEntry>();

  return {
    name: "hash",

    async get(key: string, _context: CacheContext): Promise<CachedResponse | undefined> {
      const entry = store.get(key);
      if (!entry) return undefined;

      if (now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }

      return entry.cached;
    },

    async set(key: string, response: GatewayResponse, context: CacheContext): Promise<void> {
      const ttl = context.ttl ?? DEFAULT_TTL_MS;
      const cached: CachedResponse = {
        response: { ...response, cached: true },
        cachedAt: new Date(now()).toISOString(),
      };
      // Re-inserting moves the key to the end of the insertion order, so a
      // refreshed entry isn't treated as the oldest on the next eviction.
      store.delete(key);
      store.set(key, { cached, expiresAt: now() + ttl });

      // Bound the store: evict the oldest-inserted entry once over the cap.
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
registerCachingStrategy("hash", createHashStrategy);
