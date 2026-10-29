// ── Embedding Provider Barrel ───────────────────────────────────────
//
// Importing this module causes all built-in embedding providers to
// self-register with the provider registry. Custom providers can be
// added by importing their module after this one. The gateway provider
// is the path to an embedding model on the nanohype substrate. bedrock
// calls Bedrock directly, for a cache that runs off it, and openai, which
// authenticates with a provider key, is part of a project scaffolded with
// IncludeKeyProviders, for the same.
//

import "./gateway.js";
import "./bedrock.js";
// #if IncludeKeyProviders
import "./openai.js";
// #endif
import "./mock.js";

export {
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerEmbeddingProvider,
} from "./registry.js";
export type { EmbeddingProvider } from "./types.js";
