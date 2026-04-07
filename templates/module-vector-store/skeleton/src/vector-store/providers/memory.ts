import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";
import type { VectorStoreProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { cosineSimilarity } from "../similarity.js";
import { compileFilter } from "../filters/compiler.js";

// -- In-Memory Vector Store Provider -------------------------------------
//
// Map-backed vector store for development and testing. Stores documents
// in a plain Map keyed by ID. Queries compute cosine similarity against
// all stored documents and return top-K results sorted by score.
// Supports metadata filtering via the compiled memory predicate.
//

class MemoryVectorStoreProvider implements VectorStoreProvider {
  readonly name = "memory";
  private store = new Map<string, VectorDocument>();

  async init(_config: VectorStoreConfig): Promise<void> {
    // No initialization needed for in-memory store
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.store.set(doc.id, { ...doc });
    }
  }

  async query(
    embedding: number[],
    topK: number,
    filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    const predicate = filter
      ? (compileFilter(filter, "memory") as (metadata: Record<string, unknown>) => boolean)
      : null;

    const scored: SearchResult[] = [];

    for (const doc of this.store.values()) {
      if (predicate && !predicate(doc.metadata)) continue;

      const score = cosineSimilarity(embedding, doc.embedding);
      scored.push({
        id: doc.id,
        content: doc.content,
        score,
        metadata: doc.metadata,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.store.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

// Self-register
registerProvider("memory", () => new MemoryVectorStoreProvider());
