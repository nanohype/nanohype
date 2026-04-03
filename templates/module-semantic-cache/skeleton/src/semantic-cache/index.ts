// ── Module Semantic Cache — Main Exports ────────────────────────────
//
// Public API for the semantic cache module. Import embedding providers
// and vector stores so they self-register, then expose
// createSemanticCache as the primary entry point.
//

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { validateBootstrap } from "./bootstrap.js";
import { getEmbeddingProvider, listEmbeddingProviders } from "./embedder/index.js";
import { getVectorStore, listVectorStores } from "./store/index.js";
import {
  cacheLookupTotal,
  cacheOperationDuration,
  embeddingDuration,
} from "./metrics.js";
import type { EmbeddingProvider } from "./embedder/types.js";
import type { VectorCacheStore } from "./store/types.js";
import type { SemanticCacheConfig, CacheVector, CacheHit } from "./types.js";

// Re-export everything consumers need
export {
  registerEmbeddingProvider,
  getEmbeddingProvider,
  listEmbeddingProviders,
} from "./embedder/index.js";
export {
  registerVectorStore,
  getVectorStore,
  listVectorStores,
} from "./store/index.js";
export { cosineSimilarity, normalize } from "./similarity.js";
export { createSemanticCacheStrategy } from "./gateway-adapter.js";
export type { GatewayCachingStrategy } from "./gateway-adapter.js";
export type { EmbeddingProvider } from "./embedder/types.js";
export type { VectorCacheStore, VectorStoreConfig } from "./store/types.js";
export type { SemanticCacheConfig, CacheVector, CacheHit } from "./types.js";

// ── Default Constants ──────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.95;
const DEFAULT_TTL_MS = 3_600_000; // 1 hour

// ── Semantic Cache Facade ──────────────────────────────────────────

export interface SemanticCache {
  /** The underlying embedding provider instance. */
  embedder: EmbeddingProvider;

  /** The underlying vector store instance. */
  backend: VectorCacheStore;

  /**
   * Look up a cached response by semantic similarity to the prompt.
   * Returns the best match above the similarity threshold, or
   * undefined if no match is found.
   */
  lookup(prompt: string): Promise<{ response: string; score: number } | undefined>;

  /**
   * Store a prompt/response pair in the cache with an optional TTL.
   * Generates an embedding for the prompt and upserts it into the
   * vector store.
   */
  store(prompt: string, response: string, ttlMs?: number): Promise<void>;

  /** Remove a cache entry by its id. */
  invalidate(id: string): Promise<void>;

  /** Shut down the cache, releasing resources. */
  close(): Promise<void>;
}

/** Zod schema for validating createSemanticCache arguments. */
const CreateSemanticCacheSchema = z.object({
  embeddingProvider: z.string().min(1).optional(),
  vectorBackend: z.string().min(1).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  defaultTtlMs: z.number().positive().optional(),
}).passthrough();

/**
 * Create a configured semantic cache instance.
 *
 * The embedding provider and vector store must already be registered
 * (built-in providers self-register on import via the barrel files).
 *
 *   const cache = await createSemanticCache({
 *     embeddingProvider: "openai",
 *     vectorBackend: "memory",
 *     similarityThreshold: 0.92,
 *   });
 *
 *   // Store a response
 *   await cache.store("What is TypeScript?", "TypeScript is ...");
 *
 *   // Look it up semantically
 *   const hit = await cache.lookup("Tell me about TypeScript");
 *   // hit?.response === "TypeScript is ..."
 */
export async function createSemanticCache(
  config: SemanticCacheConfig = {},
): Promise<SemanticCache> {
  const parsed = CreateSemanticCacheSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid semantic cache config: ${issues}`);
  }

  validateBootstrap();

  const embeddingProviderName = config.embeddingProvider ?? "__EMBEDDING_PROVIDER__";
  const vectorBackendName = config.vectorBackend ?? "__VECTOR_BACKEND__";
  const similarityThreshold = config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const defaultTtlMs = config.defaultTtlMs ?? DEFAULT_TTL_MS;

  const embedder = getEmbeddingProvider(embeddingProviderName);
  const vectorStore = getVectorStore(vectorBackendName);

  await vectorStore.init(config);

  return {
    embedder,
    backend: vectorStore,

    async lookup(prompt: string): Promise<{ response: string; score: number } | undefined> {
      const lookupStart = performance.now();

      // Generate embedding for the query prompt
      const embedStart = performance.now();
      const embedding = await embedder.embed(prompt);
      embeddingDuration.record(performance.now() - embedStart);

      // Search the vector store
      const hit = await vectorStore.search(embedding, similarityThreshold);

      const durationMs = performance.now() - lookupStart;
      cacheOperationDuration.record(durationMs, { operation: "lookup" });

      if (!hit) {
        cacheLookupTotal.add(1, { result: "miss" });
        return undefined;
      }

      cacheLookupTotal.add(1, { result: "hit" });
      return { response: hit.response, score: hit.score };
    },

    async store(prompt: string, response: string, ttlMs?: number): Promise<void> {
      const storeStart = performance.now();

      // Generate embedding for the prompt
      const embedStart = performance.now();
      const embedding = await embedder.embed(prompt);
      embeddingDuration.record(performance.now() - embedStart);

      const entry: CacheVector = {
        id: randomUUID(),
        embedding,
        response,
        metadata: { prompt },
        expiresAt: Date.now() + (ttlMs ?? defaultTtlMs),
      };

      await vectorStore.upsert(entry);

      cacheOperationDuration.record(performance.now() - storeStart, { operation: "store" });
    },

    async invalidate(id: string): Promise<void> {
      const start = performance.now();
      await vectorStore.delete(id);
      cacheOperationDuration.record(performance.now() - start, { operation: "invalidate" });
    },

    async close(): Promise<void> {
      await vectorStore.close();
    },
  };
}
