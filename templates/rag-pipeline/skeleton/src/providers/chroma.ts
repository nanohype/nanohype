/**
 * ChromaDB vector store provider.
 *
 * Registers itself as the "chroma" vector store provider on import.
 */

import { ChromaClient } from "chromadb";
import type { VectorStoreProvider, VectorDocument, SearchResult } from "./types.js";
import type { VectorStoreConfig } from "../config.js";
import { registerVectorStoreProvider } from "./registry.js";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

class ChromaVectorStore implements VectorStoreProvider {
  private readonly client: ChromaClient;
  private readonly collectionName: string;
  private collection: Awaited<ReturnType<ChromaClient["getOrCreateCollection"]>> | null = null;
  private readonly cb = createCircuitBreaker();

  constructor(config: VectorStoreConfig) {
    this.client = new ChromaClient({ path: config.chromaPersistDir });
    this.collectionName = config.collectionName;
  }

  async init(): Promise<void> {
    this.collection = await this.cb.execute(() =>
      this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { "hnsw:space": "cosine" },
      })
    );
    logger.info("ChromaDB initialized", { collection: this.collectionName });
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length || !this.collection) return;

    const col = this.collection;
    await this.cb.execute(() =>
      col.upsert({
        ids: documents.map((d) => d.id),
        embeddings: documents.map((d) => d.embedding),
        documents: documents.map((d) => d.content),
        metadatas: documents.map((d) => d.metadata as Record<string, string>),
      })
    );
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    if (!this.collection) return [];

    const col = this.collection;
    const results = await this.cb.execute(() =>
      col.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where: filter as Record<string, string> | undefined,
      })
    );

    const searchResults: SearchResult[] = [];
    if (results.ids?.[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances?.[0]?.[i] ?? 0;
        searchResults.push({
          id: results.ids[0][i],
          content: results.documents?.[0]?.[i] ?? "",
          score: 1.0 - distance,
          metadata: (results.metadatas?.[0]?.[i] as Record<string, unknown>) ?? {},
        });
      }
    }

    return searchResults;
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.collection) return;
    const col = this.collection;
    await this.cb.execute(() => col.delete({ ids }));
  }
}

registerVectorStoreProvider(
  "chroma",
  (config?: unknown) => new ChromaVectorStore(config as VectorStoreConfig),
);
