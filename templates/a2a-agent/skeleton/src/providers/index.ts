/**
 * Provider abstraction layer.
 *
 * Importing this module registers all built-in providers as a side
 * effect, making them available through getProvider() / listProviders().
 * The active provider is selected at runtime by passing the provider
 * name (set via the __LLM_PROVIDER__ placeholder) to getProvider().
 */

// Side-effect imports: each module calls registerProvider() at load time
import "./anthropic.js";
import "./openai.js";

// Re-export the public API
export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { LlmProvider, Message, LlmResponse } from "./types.js";
