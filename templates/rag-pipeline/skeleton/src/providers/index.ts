/**
 * Barrel export for providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export type {
  LlmProvider,
  EmbeddingProvider,
  VectorStoreProvider,
  VectorDocument,
  SearchResult,
} from "./types.js";

export {
  registerLlmProvider,
  getLlmProvider,
  listLlmProviders,
  registerEmbeddingProvider,
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerVectorStoreProvider,
  getVectorStoreProvider,
  listVectorStoreProviders,
} from "./registry.js";

// Import provider modules to trigger registration
import "./anthropic.js";
import "./openai.js";
import "./cohere.js";
import "./chroma.js";
import "./pgvector.js";
import "./qdrant.js";
import "./pinecone.js";
