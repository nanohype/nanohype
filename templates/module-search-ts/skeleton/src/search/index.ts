// ── Module Search -- Main Exports ──────────────────────────────────
//
// Public API for the search module. Imports all providers to trigger
// self-registration, then exposes createSearchClient as the primary
// entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { SearchClientConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import { searchRequestTotal, searchDurationMs, searchIndexTotal } from "./metrics.js";
import type { SearchProvider } from "./providers/types.js";
import type {
  SearchIndex,
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchConfig,
} from "./types.js";
import type { SearchClientConfig } from "./config.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { SearchProvider, SearchProviderFactory } from "./providers/types.js";
export type {
  SearchIndex,
  IndexField,
  SearchDocument,
  SearchQuery,
  SearchHit,
  SearchResult,
  Facet,
  FilterExpression,
  ComparisonFilter,
  AndFilter,
  OrFilter,
  SearchConfig,
} from "./types.js";
export { reciprocalRankFusion } from "./hybrid/combiner.js";
export type { RankableHit, RRFResult } from "./hybrid/combiner.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
export { SearchClientConfigSchema } from "./config.js";
export type { SearchClientConfig } from "./config.js";

// ── Search Client Facade ──────────────────────────────────────────

export interface SearchClient {
  /** The underlying provider instance. */
  provider: SearchProvider;

  /** Create a search index with the given schema. */
  createIndex(index: SearchIndex): Promise<void>;

  /** Index (upsert) documents into the named index. */
  indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void>;

  /** Execute a search query against the named index. */
  search(indexName: string, query: SearchQuery): Promise<SearchResult>;

  /** Delete documents by ID from the named index. */
  deleteDocuments(indexName: string, ids: string[]): Promise<void>;

  /** Retrieve index metadata by name. */
  getIndex(indexName: string): Promise<SearchIndex | undefined>;

  /** Delete an index and all its documents. */
  deleteIndex(indexName: string): Promise<void>;

  /** Shut down the client and release resources. */
  close(): Promise<void>;
}

/** Zod schema for validating createSearchClient arguments. */
const CreateSearchClientSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.record(z.unknown()).default({}),
});

/**
 * Create a configured search client backed by the named provider.
 *
 * The provider must already be registered (built-in providers
 * self-register on import via the providers barrel).
 *
 *   const client = await createSearchClient("typesense", {
 *     url: "http://localhost:8108",
 *     apiKey: "xyz",
 *   });
 *
 *   await client.createIndex({ name: "articles", fields: [...] });
 *   await client.indexDocuments("articles", docs);
 *   const results = await client.search("articles", { query: "typescript" });
 */
export async function createSearchClient(
  providerName: string = "mock",
  config: SearchConfig = {},
): Promise<SearchClient> {
  const parsed = CreateSearchClientSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid search config: ${issues}`);
  }

  validateBootstrap();

  const provider = getProvider(providerName);
  await provider.init(config);

  return {
    provider,

    async createIndex(index: SearchIndex): Promise<void> {
      await provider.createIndex(index);
      searchIndexTotal.add(1, { operation: "create" });
    },

    async indexDocuments(indexName: string, documents: SearchDocument[]): Promise<void> {
      const start = performance.now();
      await provider.indexDocuments(indexName, documents);
      searchDurationMs.record(performance.now() - start, { operation: "index" });
    },

    async search(indexName: string, query: SearchQuery): Promise<SearchResult> {
      const start = performance.now();
      const result = await provider.search(indexName, query);
      const durationMs = performance.now() - start;

      searchRequestTotal.add(1, { provider: providerName, index: indexName });
      searchDurationMs.record(durationMs, { operation: "search" });

      return result;
    },

    async deleteDocuments(indexName: string, ids: string[]): Promise<void> {
      await provider.deleteDocuments(indexName, ids);
    },

    async getIndex(indexName: string): Promise<SearchIndex | undefined> {
      return provider.getIndex(indexName);
    },

    async deleteIndex(indexName: string): Promise<void> {
      await provider.deleteIndex(indexName);
      searchIndexTotal.add(1, { operation: "delete" });
    },

    async close(): Promise<void> {
      await provider.close();
    },
  };
}
