/**
 * Provider abstraction layer.
 *
 * Importing this module registers all built-in providers as a side
 * effect, making them available through getProvider() / listProviders().
 * The active provider is selected at runtime by the LLM_PROVIDER
 * environment variable (set via the __LLM_PROVIDER__ placeholder).
 */

// Side-effect imports: each module calls registerProvider() at load time.
// The gateway provider is the path to a model on the nanohype substrate.
// bedrock calls Bedrock directly, for an application that runs off it, and
// the API-key providers are part of a project scaffolded with
// IncludeKeyProviders, for the same.
import "./gateway.js";
import "./bedrock.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
// #endif
import "./mock.js";

// Re-export the public API
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { ChatMessage, LlmProvider } from "./types.js";
