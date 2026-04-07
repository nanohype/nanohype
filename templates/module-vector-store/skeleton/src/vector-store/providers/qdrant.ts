import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";
import type { VectorStoreProvider } from "./types.js";
import { registerProvider } from "./registry.js";
import { compileFilter } from "../filters/compiler.js";
import { withRetry } from "../helpers.js";

// -- Qdrant Provider -----------------------------------------------------
//
// Qdrant HTTP API client using native fetch (no SDK dependency).
// Manages collection creation, point upsert, and filtered similarity
// search. Communicates with the Qdrant REST API at the configured URL.
//

interface QdrantConfig extends VectorStoreConfig {
  /** Qdrant server URL. Default: "http://localhost:6333". */
  url?: string;
  /** API key for authenticated Qdrant instances. */
  apiKey?: string;
  /** Collection name. Default: "embeddings". */
  collection?: string;
  /** Vector dimensions. Default: 1536. */
  dimensions?: number;
}

class QdrantProvider implements VectorStoreProvider {
  readonly name = "qdrant";
  private baseUrl = "http://localhost:6333";
  private apiKey: string | undefined;
  private collection = "embeddings";
  private dimensions = 1536;

  async init(config: QdrantConfig): Promise<void> {
    this.baseUrl = (config.url as string) || process.env.QDRANT_URL || "http://localhost:6333";
    this.apiKey = (config.apiKey as string) || process.env.QDRANT_API_KEY;
    this.collection =
      (config.collection as string) || process.env.QDRANT_COLLECTION || "embeddings";
    this.dimensions =
      (config.dimensions as number) || Number(process.env.QDRANT_DIMENSIONS) || 1536;

    // Ensure collection exists
    await withRetry(async () => {
      const existing = await this.request("GET", `/collections/${this.collection}`);
      if (existing.status === 404 || existing.result?.status === "not_found") {
        await this.request("PUT", `/collections/${this.collection}`, {
          vectors: {
            size: this.dimensions,
            distance: "Cosine",
          },
        });
      }
    });
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    const points = documents.map((doc) => ({
      id: doc.id,
      vector: doc.embedding,
      payload: {
        content: doc.content,
        ...doc.metadata,
      },
    }));

    await withRetry(async () => {
      await this.request("PUT", `/collections/${this.collection}/points`, {
        points,
      });
    });
  }

  async query(
    embedding: number[],
    topK: number,
    filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      vector: embedding,
      limit: topK,
      with_payload: true,
    };

    if (filter) {
      body.filter = compileFilter(filter, "qdrant");
    }

    const response = await withRetry(async () => {
      return this.request("POST", `/collections/${this.collection}/points/search`, body);
    });

    const results = response.result || [];
    return (results as Array<Record<string, unknown>>).map(
      (hit: Record<string, unknown>) => {
        const payload = (hit.payload || {}) as Record<string, unknown>;
        const { content, ...metadata } = payload;
        return {
          id: String(hit.id),
          content: (content as string) || "",
          score: hit.score as number,
          metadata,
        };
      },
    );
  }

  async delete(ids: string[]): Promise<void> {
    await withRetry(async () => {
      await this.request(
        "POST",
        `/collections/${this.collection}/points/delete`,
        { points: ids },
      );
    });
  }

  async count(): Promise<number> {
    const response = await this.request(
      "POST",
      `/collections/${this.collection}/points/count`,
      { exact: true },
    );
    return (response.result?.count as number) ?? 0;
  }

  async close(): Promise<void> {
    // HTTP client — no persistent connections to close
  }

  // ── HTTP Helpers ─────────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(30_000),
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      const error = new Error(`Qdrant ${method} ${path} failed: ${response.status} ${text}`);
      (error as Record<string, unknown>).status = response.status;
      throw error;
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

// Self-register
registerProvider("qdrant", () => new QdrantProvider());
