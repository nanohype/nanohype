/**
 * Provider abstraction layer.
 *
 * Importing this module triggers side-effect registration of all built-in
 * providers. To add a custom provider, create a new file that calls
 * registerProvider() and import it here.
 */

// Side-effect imports — each module registers itself on load
import "./anthropic.js";
import "./openai.js";
import "./mock.js";

// Re-export the registry API and shared types
export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { LlmProvider, ChatMessage } from "./types.js";

/**
 * Default provider configured at scaffold time.
 */
export const DEFAULT_PROVIDER = "__LLM_PROVIDER__";
