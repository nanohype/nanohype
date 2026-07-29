/**
 * Barrel export for providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export {
  getEmbeddingProvider,
  getLlmProvider,
  getVectorStoreProvider,
  listEmbeddingProviders,
  listLlmProviders,
  listVectorStoreProviders,
  registerEmbeddingProvider,
  registerLlmProvider,
  registerVectorStoreProvider,
} from "./registry.js";
export type {
  EmbeddingProvider,
  LlmProvider,
  SearchResult,
  VectorDocument,
  VectorStoreProvider,
} from "./types.js";

// Import provider modules to trigger registration. Bedrock is the org-default
// for both LLM and embeddings; the others are alternates.
import "./bedrock.js";
import "./anthropic.js";
import "./openai.js";
import "./cohere.js";
import "./chroma.js";
import "./pgvector.js";
import "./qdrant.js";
import "./pinecone.js";
import "./mock.js";
import "./mock-vectorstore.js";
