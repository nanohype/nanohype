/**
 * Barrel export for embedding providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export {
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerEmbeddingProvider,
} from "./registry.js";
export type { EmbeddingProvider } from "./types.js";

// Import provider modules to trigger registration. The gateway provider is
// the path to an embedding model on the nanohype substrate. bedrock calls
// Bedrock directly under the AWS credential chain, for a pipeline that runs
// off it.
// Scaffolded with EmbeddingProvider = __EMBEDDING_PROVIDER__.
import "./gateway.js";
import "./bedrock.js";
import "./mock.js";
