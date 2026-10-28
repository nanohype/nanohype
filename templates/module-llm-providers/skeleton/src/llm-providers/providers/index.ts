// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes every provider the project includes to
// self-register with the provider registry. Custom providers can be added
// by calling registerProvider() after this import.
//
// The bedrock, vertex, huggingface and ollama providers are optional. A
// project generated without one carries neither its file nor its import
// below, so the barrel registers exactly the providers the project ships.
//

import "./anthropic.js";
import "./openai.js";
import "./groq.js";
// #if IncludeBedrock
import "./bedrock.js";
// #endif
// #if IncludeVertex
import "./vertex.js";
// #endif
// #if IncludeHuggingFace
import "./huggingface.js";
// #endif
// #if IncludeOllama
import "./ollama.js";
// #endif
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider, LlmProviderFactory } from "./types.js";
