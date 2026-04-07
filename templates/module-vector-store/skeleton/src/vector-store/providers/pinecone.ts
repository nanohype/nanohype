import { Pinecone } from "@pinecone-database/pinecone";
import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";
import type { VectorStoreProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { compileFilter } from "../filters/compiler.js";
import { withRetry, batchChunk } from "../helpers.js";

// -- Pinecone Provider ---------------------------------------------------
//
// Pinecone SDK-based provider. Handles index connection, batched upserts
// (100 vectors per batch to stay under Pinecone limits), and query with
// metadata filtering via the Pinecone filter compiler target.
//

interface PineconeConfig extends VectorStoreConfig {
  /** Pinecone API key. */
  apiKey?: string;
  /** Pinecone index name. */
  index?: string;
  /** Optional namespace within the index. */
  namespace?: string;
}

/** Pinecone limits upserts to 100 vectors per request. */
const PINECONE_BATCH_SIZE = 100;

class PineconeProvider implements VectorStoreProvider {
  readonly name = "pinecone";
  private client: Pinecone | null = null;
  private index: ReturnType<Pinecone["index"]> | null = null;
  private namespace: string | undefined;

  async init(config: PineconeConfig): Promise<void> {
    const apiKey = (config.apiKey as string) || process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Pinecone provider requires apiKey config or PINECONE_API_KEY env var",
      );
    }

    const indexName = (config.index as string) || process.env.PINECONE_INDEX;
    if (!indexName) {
      throw new Error(
        "Pinecone provider requires index config or PINECONE_INDEX env var",
      );
    }

    this.namespace = (config.namespace as string) || process.env.PINECONE_NAMESPACE;
    this.client = new Pinecone({ apiKey });
    this.index = this.client.index(indexName);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (!this.index) throw new Error("Provider not initialized");

    const vectors = documents.map((doc) => ({
      id: doc.id,
      values: doc.embedding,
      metadata: {
        content: doc.content,
        ...doc.metadata,
      },
    }));

    const batches = batchChunk(vectors, PINECONE_BATCH_SIZE);
    const ns = this.getNamespace();

    for (const batch of batches) {
      await withRetry(async () => {
        await ns.upsert(batch);
      });
    }
  }

  async query(
    embedding: number[],
    topK: number,
    filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    if (!this.index) throw new Error("Provider not initialized");

    const queryOptions: Record<string, unknown> = {
      vector: embedding,
      topK,
      includeMetadata: true,
    };

    if (filter) {
      queryOptions.filter = compileFilter(filter, "pinecone");
    }

    const ns = this.getNamespace();
    const response = await withRetry(async () => {
      return ns.query(queryOptions as Parameters<typeof ns.query>[0]);
    });

    return (response.matches || []).map((match) => {
      const metadata = (match.metadata || {}) as Record<string, unknown>;
      const { content, ...rest } = metadata;
      return {
        id: match.id,
        content: (content as string) || "",
        score: match.score ?? 0,
        metadata: rest,
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.index) throw new Error("Provider not initialized");

    const ns = this.getNamespace();
    await withRetry(async () => {
      await ns.deleteMany(ids);
    });
  }

  async count(): Promise<number> {
    if (!this.index) throw new Error("Provider not initialized");

    const stats = await this.index.describeIndexStats();
    if (this.namespace && stats.namespaces) {
      return stats.namespaces[this.namespace]?.recordCount ?? 0;
    }
    return stats.totalRecordCount ?? 0;
  }

  async close(): Promise<void> {
    this.client = null;
    this.index = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private getNamespace() {
    if (!this.index) throw new Error("Provider not initialized");
    return this.namespace ? this.index.namespace(this.namespace) : this.index.namespace("");
  }
}

// Self-register
registerProvider("pinecone", () => new PineconeProvider());
