// -- Vector Store Types ---------------------------------------------------
//
// Core types used across the vector store module. VectorDocument represents
// a document with its embedding vector, SearchResult represents a scored
// match from a similarity query, and VectorStoreConfig holds provider
// initialization parameters.
//

export type { VectorStoreProvider } from "./providers/types.js";

/** A document stored in the vector database. */
export interface VectorDocument {
  /** Unique identifier for the document. */
  id: string;

  /** Text content of the document. */
  content: string;

  /** Embedding vector (dense float array). */
  embedding: number[];

  /** Arbitrary metadata for filtering and retrieval. */
  metadata: Record<string, unknown>;
}

/** A single result from a similarity search query. */
export interface SearchResult {
  /** Document identifier. */
  id: string;

  /** Text content of the matched document. */
  content: string;

  /** Similarity score (higher = more similar, range depends on metric). */
  score: number;

  /** Metadata associated with the matched document. */
  metadata: Record<string, unknown>;
}

/** Configuration passed to a vector store provider on initialization. */
export interface VectorStoreConfig {
  /** Provider-specific configuration values. */
  [key: string]: unknown;
}
