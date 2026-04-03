/**
 * Barrel export for embedding providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export type { EmbeddingProvider } from "./types.js";

export {
  registerEmbeddingProvider,
  getEmbeddingProvider,
  listEmbeddingProviders,
} from "./registry.js";

// Import provider modules to trigger registration
import "./openai.js";
import "./mock.js";
