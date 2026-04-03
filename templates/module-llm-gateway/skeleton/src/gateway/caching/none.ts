import type { GatewayResponse } from "../types.js";
import type { CachingStrategy, CacheContext, CachedResponse } from "./types.js";
import { registerCachingStrategy } from "./registry.js";

// ── None Caching Strategy ───────────────────────────────────────────
//
// Passthrough strategy that never caches. Always returns undefined
// on get, no-ops on set. Useful when caching should be disabled
// entirely (e.g., for non-deterministic creative generation).
//

export function createNoneStrategy(): CachingStrategy {
  return {
    name: "none",

    async get(_key: string, _context: CacheContext): Promise<CachedResponse | undefined> {
      return undefined;
    },

    async set(_key: string, _response: GatewayResponse, _context: CacheContext): Promise<void> {
      // Intentionally empty — no caching
    },

    async invalidate(_key: string): Promise<void> {
      // Intentionally empty — nothing to invalidate
    },

    async close(): Promise<void> {
      // Intentionally empty — no resources to release
    },
  };
}

// Self-register
registerCachingStrategy("none", createNoneStrategy);
