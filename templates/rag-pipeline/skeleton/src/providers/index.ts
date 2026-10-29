/**
 * Barrel export for providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export type { EmbeddingProviderFactory, LlmProviderFactory } from "./registry.js";
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
  EmbeddingProviderSettings,
  LlmProvider,
  LlmProviderSettings,
  SearchResult,
  VectorDocument,
  VectorStoreProvider,
} from "./types.js";

// Import provider modules to trigger registration. The gateway providers are
// the path to a model on the nanohype substrate, for generation and for
// embeddings, and bedrock calls Bedrock directly under the AWS credential
// chain, for a pipeline that runs off it. Neither holds a provider key.
// Scaffolded with LlmProvider:EmbeddingProvider = __LLM_PROVIDER__:__EMBEDDING_PROVIDER__.
import "./gateway.js";
import "./bedrock.js";
import "./chroma.js";
import "./pgvector.js";
import "./qdrant.js";
import "./pinecone.js";
import "./mock.js";
import "./mock-vectorstore.js";
