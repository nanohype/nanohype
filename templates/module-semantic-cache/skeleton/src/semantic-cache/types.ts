// ── Semantic Cache Core Types ───────────────────────────────────────
//
// Shared interfaces for cache vectors, search results, configuration,
// and the top-level semantic cache facade. These are provider-agnostic
// — every embedding provider and vector store works against the same
// shapes.
//

/** A cached vector entry stored in the vector store. */
export interface CacheVector {
  /** Unique identifier for this cache entry. */
  id: string;

  /** The embedding vector for the cached prompt. */
  embedding: number[];

  /** The cached LLM response body. */
  response: string;

  /** Arbitrary metadata attached to this cache entry. */
  metadata: Record<string, unknown>;

  /** Unix timestamp (ms) when this entry expires. */
  expiresAt: number;
}

/** A search result returned from the vector store. */
export interface CacheHit {
  /** The id of the matched cache entry. */
  id: string;

  /** The cached LLM response body. */
  response: string;

  /** Cosine similarity score between 0 and 1. */
  score: number;

  /** Arbitrary metadata attached to this cache entry. */
  metadata: Record<string, unknown>;
}

/** Configuration for creating a semantic cache instance. */
export interface SemanticCacheConfig {
  /** Name of the embedding provider to use. */
  embeddingProvider?: string;

  /** Name of the vector store backend to use. */
  vectorBackend?: string;

  /** Minimum cosine similarity threshold for a cache hit (0–1). Default: 0.95 */
  similarityThreshold?: number;

  /** Default TTL in milliseconds. Default: 3_600_000 (1 hour) */
  defaultTtlMs?: number;

  /** Provider-specific options passed through to init. */
  [key: string]: unknown;
}
