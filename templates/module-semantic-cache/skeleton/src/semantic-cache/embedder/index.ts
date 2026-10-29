// ── Embedding Provider Barrel ───────────────────────────────────────
//
// Importing this module causes all built-in embedding providers to
// self-register with the provider registry. Custom providers can be
// added by importing their module after this one. The gateway provider
// is the path to an embedding model on the nanohype substrate, and bedrock
// calls Bedrock directly under the AWS credential chain, for a cache that
// runs off it. Neither holds a provider key.
//

// Scaffolded with EmbeddingProvider = __EMBEDDING_PROVIDER__.
import "./gateway.js";
import "./bedrock.js";
import "./mock.js";

export {
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerEmbeddingProvider,
} from "./registry.js";
export type { EmbeddingProvider } from "./types.js";
