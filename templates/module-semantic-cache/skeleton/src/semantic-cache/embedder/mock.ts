import { registerEmbeddingProvider } from "./registry.js";
import type { EmbeddingProvider } from "./types.js";

// ── Mock Embedding Provider ────────────────────────────────────────
//
// Deterministic embedding provider for testing. Hashes the input
// text to produce a fixed-length pseudo-embedding vector. The same
// input always produces the same embedding, making tests
// reproducible. Uses 64 dimensions to keep vectors lightweight.
//

const DIMENSIONS = 64;

/**
 * Simple string hash that produces a deterministic 32-bit integer.
 * Used to seed the pseudo-random vector generation.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

/**
 * Generate a deterministic pseudo-embedding from a string hash.
 * Uses a simple linear congruential generator seeded by the hash
 * to fill each dimension. The resulting vector is normalized to
 * unit length so cosine similarity comparisons are meaningful.
 */
function textToEmbedding(text: string): number[] {
  let seed = Math.abs(hashCode(text)) || 1;
  const raw: number[] = [];

  for (let i = 0; i < DIMENSIONS; i++) {
    // Linear congruential generator
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    // Map to [-1, 1]
    raw.push((seed / 0x7fffffff) * 2 - 1);
  }

  // Normalize to unit length
  let norm = 0;
  for (const v of raw) norm += v * v;
  norm = Math.sqrt(norm);

  return raw.map((v) => v / norm);
}

const mockProvider: EmbeddingProvider = {
  name: "mock",
  dimensions: DIMENSIONS,

  async embed(text: string): Promise<number[]> {
    return textToEmbedding(text);
  },

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => textToEmbedding(t));
  },
};

// Self-register
registerEmbeddingProvider(mockProvider);
