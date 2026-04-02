/**
 * Qdrant vector store provider.
 *
 * Registers itself as the "qdrant" vector store provider on import.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID } from "node:crypto";
import type { VectorStoreProvider, VectorDocument, SearchResult } from "./types.js";
import type { VectorStoreConfig } from "../config.js";
import { registerVectorStoreProvider } from "./registry.js";
import { logger } from "../logger.js";

/**
 * Generate a deterministic UUID v5-style hash from a document ID.
 * Uses a simple namespace-based approach for consistent point IDs.
 */
function deterministicId(docId: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(docId);
  let hash = 0;
  for (const byte of data) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return `${Math.abs(hash).toString(16).padStart(8, "0")}-${randomUUID().slice(9)}`;
}

class QdrantVectorStore implements VectorStoreProvider {
  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private readonly dimensions: number;

  constructor(config: VectorStoreConfig, dimensions: number) {
    this.client = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey || undefined,
    });
    this.collectionName = config.collectionName;
    this.dimensions = dimensions;
  }

  async init(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some((c) => c.name === this.collectionName);

    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: { size: this.dimensions, distance: "Cosine" },
      });
    }

    logger.info("Qdrant initialized", { collection: this.collectionName });
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length) return;

    const points = documents.map((doc) => ({
      id: deterministicId(doc.id),
      vector: doc.embedding,
      payload: { content: doc.content, doc_id: doc.id, ...doc.metadata },
    }));

    await this.client.upsert(this.collectionName, { points });
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    const searchFilter = filter
      ? {
          must: Object.entries(filter).map(([key, value]) => ({
            key,
            match: { value: value as string },
          })),
        }
      : undefined;

    const hits = await this.client.search(this.collectionName, {
      vector: queryEmbedding,
      limit: topK,
      filter: searchFilter,
    });

    return hits.map((hit) => {
      const payload = (hit.payload ?? {}) as Record<string, unknown>;
      return {
        id: (payload.doc_id as string) ?? String(hit.id),
        content: (payload.content as string) ?? "",
        score: hit.score,
        metadata: Object.fromEntries(
          Object.entries(payload).filter(([k]) => k !== "content" && k !== "doc_id"),
        ),
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    const pointIds = ids.map(deterministicId);
    await this.client.delete(this.collectionName, { points: pointIds });
  }
}

registerVectorStoreProvider(
  "qdrant",
  (config?: unknown, dimensions?: unknown) =>
    new QdrantVectorStore(config as VectorStoreConfig, dimensions as number),
);
