// -- __PROJECT_NAME__ ────────────────────────────────────────────────
//
// __DESCRIPTION__
//
// Main entry point. Exports the VectorStore factory and all public
// types needed by consumers.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import type { VectorDocument, SearchResult, VectorStoreConfig } from "./types.js";
import type { FilterExpression } from "./filters/types.js";
import type { VectorStoreProvider } from "./providers/types.js";
import { getProvider } from "./providers/registry.js";

// ── VectorStore Facade ────────────────────────────────────────────

export class VectorStore {
  private provider: VectorStoreProvider;

  constructor(provider: VectorStoreProvider) {
    this.provider = provider;
  }

  /** The name of the underlying vector store provider. */
  get providerName(): string {
    return this.provider.name;
  }

  /** Insert or update documents in the store. */
  async upsert(documents: VectorDocument[]): Promise<void> {
    return this.provider.upsert(documents);
  }

  /**
   * Query for similar documents by embedding vector.
   *
   * @param embedding  Query vector.
   * @param topK       Maximum number of results to return.
   * @param filter     Optional metadata filter expression.
   */
  async query(
    embedding: number[],
    topK: number,
    filter?: FilterExpression,
  ): Promise<SearchResult[]> {
    return this.provider.query(embedding, topK, filter);
  }

  /** Delete documents by their IDs. */
  async delete(ids: string[]): Promise<void> {
    return this.provider.delete(ids);
  }

  /** Return the total number of documents in the store. */
  async count(): Promise<number> {
    return this.provider.count();
  }

  /** Release connections and clean up resources. */
  async close(): Promise<void> {
    return this.provider.close();
  }
}

// ── Factory ───────────────────────────────────────────────────────

/** Zod schema for validating createVectorStore arguments. */
const CreateVectorStoreSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.record(z.unknown()).default({}),
});

/**
 * Create and initialize a vector store for the named provider.
 *
 * @param providerName  Provider identifier (e.g. "memory", "pgvector", "qdrant", "pinecone").
 * @param config        Provider-specific configuration.
 * @returns             An initialized VectorStore.
 */
export async function createVectorStore(
  providerName: string,
  config: VectorStoreConfig = {},
): Promise<VectorStore> {
  const parsed = CreateVectorStoreSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid vector store config: ${issues}`);
  }

  validateBootstrap();

  // Ensure all built-in providers are registered
  await import("./providers/index.js");

  const provider = getProvider(providerName);
  await provider.init(config);
  return new VectorStore(provider);
}

// ── Re-exports ────────────────────────────────────────────────────

export type { VectorDocument, SearchResult, VectorStoreConfig } from "./types.js";
export type { VectorStoreProvider } from "./providers/types.js";
export type { FilterExpression, ComparisonFilter, AndFilter, OrFilter } from "./filters/types.js";
export { compileFilter } from "./filters/compiler.js";
export type { FilterBackend } from "./filters/compiler.js";
export { registerProvider, getProvider, listProviders } from "./providers/registry.js";
export { withRetry, batchChunk } from "./helpers.js";
export { cosineSimilarity, dotProduct, normalize, magnitude } from "./similarity.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
