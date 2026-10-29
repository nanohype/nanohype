/**
 * Provider abstraction layer.
 *
 * Importing this module registers all built-in providers as a side
 * effect, making them available through getProvider() / listProviders().
 * The active provider is selected at runtime by passing the provider
 * name (set via the __LLM_PROVIDER__ placeholder) to getProvider().
 */

// Side-effect imports: each module calls registerProvider() at load time.
// The gateway provider is the path to a model on the nanohype substrate,
// and holds no model credential.
// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./gateway.js";

// Re-export the public API
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider, LlmResponse, Message } from "./types.js";
