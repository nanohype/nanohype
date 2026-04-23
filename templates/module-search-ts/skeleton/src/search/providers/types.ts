// ── Search Provider Interface ──────────────────────────────────────
//
// All search providers implement this interface. The registry stores
// provider factories -- each call to getProvider() returns a fresh
// instance with its own circuit breaker and API client state.
//
// No module-level mutable state: API clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type {
  SearchIndex,
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchConfig,
} from "../types.js";

/** Provider factory -- returns a new SearchProvider instance each time. */
export type SearchProviderFactory = () => SearchProvider;

export interface SearchProvider {
  /** Unique provider name (e.g. "typesense", "algolia", "meilisearch"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: SearchConfig): Promise<void>;

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

  /** Gracefully shut down the provider, releasing connections. */
  close(): Promise<void>;
}
