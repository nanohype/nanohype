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

// Import provider modules to trigger registration. Bedrock (Titan v2) is the
// org default; openai is an alternate.
import "./bedrock.js";
import "./openai.js";
import "./mock.js";
