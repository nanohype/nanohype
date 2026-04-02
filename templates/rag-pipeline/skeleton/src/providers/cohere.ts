/**
 * Cohere embedding provider.
 *
 * Registers itself as the "cohere" embedding provider on import.
 */

import { CohereClient } from "cohere-ai";
import type { EmbeddingProvider } from "./types.js";
import { registerEmbeddingProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

class CohereEmbedder implements EmbeddingProvider {
  private readonly client: CohereClient;
  private readonly model: string;
  private readonly dims: number;
  private readonly batchSize: number;
  private readonly cb = createCircuitBreaker();

  constructor(model = "embed-english-v3.0", dims = 1024, batchSize = 96, apiKey?: string) {
    const key = apiKey || process.env.COHERE_API_KEY;
    if (!key) {
      throw new Error(
        "COHERE_API_KEY environment variable is required for Cohere embeddings",
      );
    }
    this.client = new CohereClient({ token: key });
    this.model = model;
    this.dims = dims;
    this.batchSize = batchSize;
  }

  get dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.cb.execute(() =>
      this.client.embed({
        texts: [text],
        model: this.model,
        inputType: "search_document",
      })
    );

    const embeddings = response.embeddings;
    if (Array.isArray(embeddings) && Array.isArray(embeddings[0])) {
      return embeddings[0] as number[];
    }
    throw new Error("Unexpected embedding response format from Cohere");
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.cb.execute(() =>
        this.client.embed({
          texts: batch,
          model: this.model,
          inputType: "search_document",
        })
      );

      const embeddings = response.embeddings;
      if (Array.isArray(embeddings)) {
        allEmbeddings.push(...(embeddings as number[][]));
      }
    }

    return allEmbeddings;
  }
}

registerEmbeddingProvider(
  "cohere",
  (model?: unknown, dims?: unknown, batchSize?: unknown, apiKey?: unknown) =>
    new CohereEmbedder(
      model as string,
      dims as number,
      batchSize as number,
      apiKey as string,
    ),
);
