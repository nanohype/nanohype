/**
 * Mock embedding provider for local development without API keys.
 *
 * Generates deterministic hash-based embeddings — the same input text
 * always produces the same vector. Useful for testing pipeline
 * structure without incurring API costs.
 *
 * Registers itself as the "mock" embedding provider on import.
 */

import { createHash } from "node:crypto";

import type { EmbeddingProvider } from "./types.js";
import { registerEmbeddingProvider } from "./registry.js";

const DEFAULT_DIMENSIONS = 128;

class MockEmbedder implements EmbeddingProvider {
  readonly name = "mock";
  readonly dimensions: number;

  constructor(dims = DEFAULT_DIMENSIONS) {
    this.dimensions = dims;
  }

  async embed(text: string): Promise<number[]> {
    return this.hashEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashEmbed(text));
  }

  /**
   * Generate a deterministic embedding from a SHA-256 hash of the input.
   * Distributes hash bytes across the embedding dimensions and normalizes
   * to produce unit-length vectors.
   */
  private hashEmbed(text: string): number[] {
    const hash = createHash("sha256").update(text, "utf-8").digest();
    const embedding = new Array<number>(this.dimensions);

    for (let i = 0; i < this.dimensions; i++) {
      // Cycle through hash bytes and map to [-1, 1] range
      const byteIndex = i % hash.length;
      embedding[i] = (hash[byteIndex] / 127.5) - 1;
    }

    // Normalize to unit length
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}

registerEmbeddingProvider(
  "mock",
  (dims?: unknown) => new MockEmbedder(dims as number),
);
