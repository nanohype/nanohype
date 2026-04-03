// ── Vector Cache Store Interface ────────────────────────────────────
//
// All vector cache store backends implement this interface. The
// registry pattern allows new backends to be added by importing a
// store module that calls registerVectorStore() at the module level.
//

import type { CacheVector, CacheHit } from "../types.js";

export interface VectorStoreConfig {
  /** Backend-specific configuration options. */
  [key: string]: unknown;
}

export interface VectorCacheStore {
  /** Unique backend name (e.g. "memory"). */
  readonly name: string;

  /** Initialize the store with configuration. */
  init(config: VectorStoreConfig): Promise<void>;

  /** Insert or update a cache vector entry. */
  upsert(entry: CacheVector): Promise<void>;

  /**
   * Search for the best matching entry above the similarity threshold.
   * Returns undefined if no entry meets the threshold or all entries
   * are expired.
   */
  search(embedding: number[], threshold: number): Promise<CacheHit | undefined>;

  /** Delete a cache entry by id. */
  delete(id: string): Promise<void>;

  /** Return the number of entries currently in the store. */
  count(): Promise<number>;

  /** Gracefully shut down the store, releasing resources. */
  close(): Promise<void>;
}
