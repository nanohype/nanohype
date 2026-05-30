import { cosineSimilarity } from "../similarity.js";
import { registerVectorStore } from "./registry.js";
import type { VectorCacheStore, VectorStoreConfig } from "./types.js";
import type { CacheVector, CacheHit } from "../types.js";

// ── In-Memory Vector Store ─────────────────────────────────────────
//
// A class-based Map-backed vector store suitable for development and
// testing. Each init() call produces its own isolated store instance.
// Entries are stored in memory and lost on process exit. Search
// computes cosine similarity against all stored vectors and returns
// the best match above the threshold. Expired entries are skipped
// during search and lazily cleaned up.
//

class MemoryVectorCacheStore implements VectorCacheStore {
  readonly name = "memory";
  private entries = new Map<string, CacheVector>();
  private readonly maxEntries: number;

  // Bound the cache so a stream of distinct prompts (every miss is upserted)
  // can't grow memory without limit until TTL. Default 1000; override per store.
  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  private isExpired(entry: CacheVector): boolean {
    return Date.now() >= entry.expiresAt;
  }

  /**
   * Lazily prune expired entries. Called periodically during search
   * to avoid unbounded memory growth.
   */
  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(id);
      }
    }
  }

  async init(_config: VectorStoreConfig): Promise<void> {
    // No setup needed for in-memory store
  }

  async upsert(entry: CacheVector): Promise<void> {
    // Re-insert moves the key to the most-recently-used end of the Map.
    this.entries.delete(entry.id);
    this.entries.set(entry.id, entry);
    this.evictIfNeeded();
  }

  /**
   * Keep the cache bounded: prune expired entries, then evict the oldest
   * (least-recently-written) until within maxEntries. Map preserves insertion
   * order, so the first key is the oldest.
   */
  private evictIfNeeded(): void {
    this.pruneExpired();
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async search(embedding: number[], threshold: number): Promise<CacheHit | undefined> {
    let bestHit: CacheHit | undefined;
    let bestScore = -Infinity;

    for (const [_id, entry] of this.entries) {
      // Skip expired entries (lazy cleanup)
      if (this.isExpired(entry)) continue;

      const score = cosineSimilarity(embedding, entry.embedding);

      if (score >= threshold && score > bestScore) {
        bestScore = score;
        bestHit = {
          id: entry.id,
          response: entry.response,
          score,
          metadata: entry.metadata,
        };
      }
    }

    // Periodic lazy cleanup
    this.pruneExpired();

    return bestHit;
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async count(): Promise<number> {
    // Prune before counting so the number reflects live entries
    this.pruneExpired();
    return this.entries.size;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

// Self-register a factory — each createSemanticCache() gets a fresh,
// isolated in-memory store.
registerVectorStore("memory", () => new MemoryVectorCacheStore());
