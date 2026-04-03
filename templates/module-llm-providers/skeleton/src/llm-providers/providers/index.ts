// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by calling
// registerProvider() after this import.
//
// Conditional providers (bedrock, azure-openai, vertex, huggingface,
// ollama) are only present when their respective template conditionals
// are enabled. Missing imports are harmless — the barrel only imports
// what the scaffolding tool included.
//

import "./anthropic.js";
import "./openai.js";
import "./groq.js";
import "./mock.js";

// Conditional providers — these files may not exist depending on
// template variables. The scaffolding tool excludes the file entirely
// when the conditional is false, so these imports are only present
// in the generated output when enabled.
import "./bedrock.js";
import "./azure-openai.js";
import "./vertex.js";
import "./huggingface.js";
import "./ollama.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { LlmProvider, LlmProviderFactory } from "./types.js";
