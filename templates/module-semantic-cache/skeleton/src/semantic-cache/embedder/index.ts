// ── Embedding Provider Barrel ───────────────────────────────────────
//
// Importing this module causes all built-in embedding providers to
// self-register with the provider registry. Custom providers can be
// added by importing their module after this one.
//

import "./bedrock.js";
import "./openai.js";
import "./mock.js";

export {
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerEmbeddingProvider,
} from "./registry.js";
export type { EmbeddingProvider } from "./types.js";
