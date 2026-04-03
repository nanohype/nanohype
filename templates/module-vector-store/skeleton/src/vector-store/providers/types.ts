// -- VectorStoreProvider Interface ----------------------------------------
//
// All vector store backends implement this interface. The registry pattern
// allows new providers to be added by importing a provider module that
// calls registerProvider() at the module level.
//

import type { VectorDocument, SearchResult, VectorStoreConfig } from "../types.js";
import type { FilterExpression } from "../filters/types.js";

export interface VectorStoreProvider {
  /** Unique provider name (e.g. "memory", "pgvector", "qdrant", "pinecone"). */
  readonly name: string;

  /** Initialize the provider with backend-specific configuration. */
  init(config: VectorStoreConfig): Promise<void>;

  /** Insert or update documents in the store. */
  upsert(documents: VectorDocument[]): Promise<void>;

  /**
   * Query for similar documents by embedding vector.
   *
   * @param embedding  Query vector.
   * @param topK       Maximum number of results to return.
   * @param filter     Optional metadata filter expression.
   * @returns          Ranked search results sorted by descending similarity.
   */
  query(embedding: number[], topK: number, filter?: FilterExpression): Promise<SearchResult[]>;

  /** Delete documents by their IDs. */
  delete(ids: string[]): Promise<void>;

  /** Return the total number of documents in the store. */
  count(): Promise<number>;

  /** Release connections and clean up resources. */
  close(): Promise<void>;
}
