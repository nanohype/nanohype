/**
 * ChromaDB vector store provider.
 *
 * Registers itself as the "chroma" vector store provider on import.
 */

import { ChromaClient } from "chromadb";
import type { Collection, Metadata, Where } from "chromadb";
import type { VectorStoreProvider, VectorDocument, SearchResult } from "./types.js";
import type { VectorStoreConfig } from "../config.js";
import { registerVectorStoreProvider } from "./registry.js";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

// The JS Chroma client (v3) is an HTTP client — it talks to a running Chroma
// server, not an in-process store (the embedded/persistent mode is Python-only).
// Run one for local dev with `docker run -p 8000:8000 chromadb/chroma`; in a
// cluster, point chromaUrl at the Chroma service (or use the pgvector backend,
// which is the durable default).
class ChromaVectorStore implements VectorStoreProvider {
  private readonly client: ChromaClient;
  private readonly collectionName: string;
  private collection: Collection | null = null;
  private readonly cb = createCircuitBreaker();

  constructor(config: VectorStoreConfig) {
    const url = new URL(config.chromaUrl);
    this.client = new ChromaClient({
      host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 8000,
      ssl: url.protocol === "https:",
    });
    this.collectionName = config.collectionName;
  }

  async init(): Promise<void> {
    this.collection = await this.cb.execute(() =>
      this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { "hnsw:space": "cosine" },
        // We always supply pre-computed embeddings, so no embedding function is
        // needed; null skips loading the default (which isn't bundled in v3).
        embeddingFunction: null,
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
        metadatas: documents.map((d) => d.metadata as Metadata),
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
        where: filter as Where | undefined,
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
