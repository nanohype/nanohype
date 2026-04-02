/**
 * Pinecone vector store provider.
 *
 * Registers itself as the "pinecone" vector store provider on import.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import type { VectorStoreProvider, VectorDocument, SearchResult } from "./types.js";
import type { VectorStoreConfig } from "../config.js";
import { registerVectorStoreProvider } from "./registry.js";
import { logger } from "../logger.js";

class PineconeVectorStore implements VectorStoreProvider {
  private readonly index: ReturnType<Pinecone["index"]>;
  private readonly namespace: string;

  constructor(config: VectorStoreConfig) {
    if (!config.pineconeApiKey) {
      throw new Error("VECTORSTORE_PINECONE_API_KEY is required for Pinecone");
    }

    const pc = new Pinecone({ apiKey: config.pineconeApiKey });
    this.index = pc.index(config.pineconeIndexName);
    this.namespace = config.collectionName;
  }

  async init(): Promise<void> {
    logger.info("Pinecone initialized", { namespace: this.namespace });
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length) return;

    const vectors = documents.map((doc) => ({
      id: doc.id,
      values: doc.embedding,
      metadata: { content: doc.content, ...doc.metadata } as Record<string, string>,
    }));

    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await this.index.namespace(this.namespace).upsert(batch);
    }
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    const queryParams: {
      vector: number[];
      topK: number;
      includeMetadata: boolean;
      filter?: Record<string, unknown>;
    } = {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    };

    if (filter) {
      queryParams.filter = Object.fromEntries(
        Object.entries(filter).map(([k, v]) => [k, { $eq: v }]),
      );
    }

    const response = await this.index.namespace(this.namespace).query(queryParams);

    return (response.matches ?? []).map((match) => {
      const metadata = { ...(match.metadata ?? {}) } as Record<string, unknown>;
      const content = (metadata.content as string) ?? "";
      delete metadata.content;

      return {
        id: match.id,
        content,
        score: match.score ?? 0,
        metadata,
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    await this.index.namespace(this.namespace).deleteMany(ids);
  }
}

registerVectorStoreProvider(
  "pinecone",
  (config?: unknown) => new PineconeVectorStore(config as VectorStoreConfig),
);
