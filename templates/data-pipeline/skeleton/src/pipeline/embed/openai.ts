/**
 * OpenAI embedding provider.
 *
 * Uses the text-embedding-3-small model via the OpenAI SDK. The SDK
 * client is lazily initialized on first use. Wraps all API calls in
 * a circuit breaker to handle transient failures.
 *
 * Registers itself as the "openai" embedding provider on import.
 */

import type { EmbeddingProvider } from "./types.js";
import { registerEmbeddingProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

class OpenAIEmbedder implements EmbeddingProvider {
  readonly name = "openai";

  private client: InstanceType<typeof import("openai").default> | null = null;
  private readonly model: string;
  private readonly dims: number;
  private readonly batchSize: number;
  private readonly apiKey: string;
  private readonly cb = createCircuitBreaker();

  constructor(model = "text-embedding-3-small", dims = 1536, batchSize = 128, apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAI embeddings",
      );
    }
    this.apiKey = key;
    this.model = model;
    this.dims = dims;
    this.batchSize = batchSize;
  }

  get dimensions(): number {
    return this.dims;
  }

  private async getClient(): Promise<InstanceType<typeof import("openai").default>> {
    if (!this.client) {
      const OpenAI = (await import("openai")).default;
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async embed(text: string): Promise<number[]> {
    const client = await this.getClient();
    const response = await this.cb.execute(() =>
      client.embeddings.create({
        input: [text],
        model: this.model,
        dimensions: this.dims,
      }),
    );
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const client = await this.getClient();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.cb.execute(() =>
        client.embeddings.create({
          input: batch,
          model: this.model,
          dimensions: this.dims,
        }),
      );
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((item) => item.embedding));
    }

    return allEmbeddings;
  }
}

registerEmbeddingProvider(
  "openai",
  (model?: unknown, dims?: unknown, batchSize?: unknown, apiKey?: unknown) =>
    new OpenAIEmbedder(
      model as string,
      dims as number,
      batchSize as number,
      apiKey as string,
    ),
);
