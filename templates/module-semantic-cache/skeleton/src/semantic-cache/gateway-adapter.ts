// ── Gateway Adapter ─────────────────────────────────────────────────
//
// Bridges the semantic cache into the LLM gateway's CachingStrategy
// interface using structural typing (duck typing). There is no import
// dependency on the gateway — any object that satisfies the
// GatewayCachingStrategy shape works. This keeps the semantic cache
// module standalone while being a drop-in caching backend for LLM
// gateway middleware.
//

import type { SemanticCache } from "./index.js";

/**
 * The caching strategy interface expected by LLM gateways.
 * Defined here using structural typing — no import dependency
 * on the gateway module. Mirrors the gateway's CachingStrategy
 * interface: async methods, CachedResponse shape with `response`
 * and `cachedAt` fields.
 */
export interface GatewayCachingStrategy {
  readonly name: string;
  get(
    key: string,
    context: { prompt: string; model: string; params: Record<string, unknown>; ttl?: number },
  ): Promise<{ response: { text: string; model: string; provider: string; inputTokens: number; outputTokens: number; latencyMs: number; cached: boolean; cost: number }; cachedAt: string } | undefined>;
  set(
    key: string,
    response: { text: string; model: string; provider: string; inputTokens: number; outputTokens: number; latencyMs: number; cached: boolean; cost: number },
    context: { prompt: string; model: string; params: Record<string, unknown>; ttl?: number },
  ): Promise<void>;
  invalidate(key: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Create a GatewayCachingStrategy backed by a SemanticCache instance.
 *
 * The adapter ignores the `key` parameter for get/set operations and
 * instead uses the prompt text for semantic lookup. The key-based
 * `invalidate` delegates to the cache's invalidate-by-id method.
 *
 *   const cache = await createSemanticCache({ ... });
 *   const strategy = createSemanticCacheStrategy(cache);
 *   // Pass strategy to your LLM gateway
 */
export function createSemanticCacheStrategy(cache: SemanticCache): GatewayCachingStrategy {
  return {
    name: "semantic-cache",

    async get(
      _key: string,
      context: { prompt: string; model: string; params: Record<string, unknown>; ttl?: number },
    ) {
      const hit = await cache.lookup(context.prompt);
      if (!hit) return undefined;

      return {
        response: {
          text: hit.response,
          model: context.model,
          provider: "semantic-cache",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          cached: true,
          cost: 0,
        },
        cachedAt: new Date().toISOString(),
      };
    },

    async set(
      _key: string,
      response: { text: string; model: string; provider: string; inputTokens: number; outputTokens: number; latencyMs: number; cached: boolean; cost: number },
      context: { prompt: string; model: string; params: Record<string, unknown>; ttl?: number },
    ): Promise<void> {
      const ttlMs = context.ttl != null ? context.ttl : undefined;
      await cache.store(context.prompt, response.text, ttlMs);
    },

    async invalidate(key: string): Promise<void> {
      await cache.invalidate(key);
    },

    async close(): Promise<void> {
      await cache.close();
    },
  };
}
