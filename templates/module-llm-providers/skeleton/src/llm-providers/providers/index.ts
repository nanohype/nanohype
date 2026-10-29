// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes every provider the project includes to
// self-register with the provider registry. Custom providers can be added
// by calling registerProvider() after this import.
//
// The gateway and mock providers ship with every project. The anthropic,
// openai and groq providers authenticate with a provider API key, which
// the LLM policy permits only off the substrate, so they ship only with
// IncludeKeyProviders; the bedrock, vertex, huggingface and ollama
// providers are optional too. A project generated without one carries
// neither its file nor its import below, so the barrel registers exactly
// the providers the project ships.
//

// Scaffolded with DefaultProvider:IncludeKeyProviders:IncludeBedrock:IncludeVertex:IncludeHuggingFace:IncludeOllama = __PROVIDER_CHECK__.
import "./gateway.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
import "./groq.js";
// #endif
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
