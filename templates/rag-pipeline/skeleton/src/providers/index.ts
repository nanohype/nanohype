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
// embeddings. bedrock calls Bedrock directly, for a pipeline that runs off
// it, and the API-key providers are part of a project scaffolded with
// IncludeKeyProviders, for the same.
// Scaffolded with LlmProvider:EmbeddingProvider:IncludeKeyProviders = __PROVIDER_CHECK__.
import "./gateway.js";
import "./bedrock.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
import "./cohere.js";
// #endif
import "./chroma.js";
import "./pgvector.js";
import "./qdrant.js";
import "./pinecone.js";
import "./mock.js";
import "./mock-vectorstore.js";
