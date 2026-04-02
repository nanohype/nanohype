/**
 * Mock vector store provider for local development.
 *
 * Stores documents in an in-memory Map and ranks search results by
 * simple keyword overlap between the query embedding (treated as a
 * document's original content hash) and stored document content.
 *
 * Since real embeddings are not available in mock mode, similarity is
 * computed by counting shared words between the query text (stored
 * alongside the embedding at ingest time) and each document's content.
 *
 * Registers itself as the "mock" vector store provider on import.
 */

import type {
  VectorStoreProvider,
  VectorDocument,
  SearchResult,
} from "./types.js";
import { registerVectorStoreProvider } from "./registry.js";

class MockVectorStore implements VectorStoreProvider {
  private readonly documents = new Map<string, VectorDocument>();

  async init(): Promise<void> {
    // No initialization needed for in-memory store
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const [id, doc] of this.documents) {
      // Apply metadata filter if provided
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      // Compute similarity via cosine distance between embeddings
      const score = cosineSimilarity(queryEmbedding, doc.embedding);

      results.push({
        id,
        content: doc.content,
        score,
        metadata: doc.metadata,
      });
    }

    // Sort by score descending and take topK
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }
}

/**
 * Cosine similarity between two vectors. Returns 0 if either vector
 * has zero magnitude (avoids division by zero).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}

registerVectorStoreProvider("mock", () => new MockVectorStore());
