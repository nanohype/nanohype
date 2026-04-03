import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";
import type { VectorStoreProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// -- Mock Provider -------------------------------------------------------
//
// Deterministic test provider. Returns results based on a simple hash
// of the input embedding so tests can assert on predictable output
// without any real vector math. Stores documents in memory and uses
// the embedding hash to generate stable similarity scores.
//

/** Simple hash of a float array → number in [0, 1). */
function hashEmbedding(embedding: number[]): number {
  let hash = 0;
  for (let i = 0; i < embedding.length; i++) {
    // Combine each element into the hash
    hash = ((hash << 5) - hash + Math.floor(embedding[i] * 1000)) | 0;
  }
  // Normalize to [0, 1)
  return Math.abs(hash % 10000) / 10000;
}

class MockVectorStoreProvider implements VectorStoreProvider {
  readonly name = "mock";
  private store = new Map<string, VectorDocument>();

  async init(_config: VectorStoreConfig): Promise<void> {
    // No initialization needed
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.store.set(doc.id, { ...doc });
    }
  }

  async query(
    embedding: number[],
    topK: number,
    _filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    const baseHash = hashEmbedding(embedding);
    const results: SearchResult[] = [];

    for (const doc of this.store.values()) {
      // Deterministic score: combine query hash with doc embedding hash
      const docHash = hashEmbedding(doc.embedding);
      const score = 1 - Math.abs(baseHash - docHash);

      results.push({
        id: doc.id,
        content: doc.content,
        score,
        metadata: doc.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
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
registerProvider(new MockVectorStoreProvider());
