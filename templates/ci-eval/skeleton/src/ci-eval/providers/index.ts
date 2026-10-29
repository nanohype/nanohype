/**
 * Provider abstraction layer.
 *
 * Importing this module triggers side-effect registration of all built-in
 * providers. To add a custom provider, create a new file that calls
 * registerProvider() and import it here.
 */

// Side-effect imports — each module registers itself on load. The gateway
// provider calls the Platform's ModelGateway and holds no credential, for a
// run inside the cluster; the API-key providers serve a run outside it.
import "./gateway.js";
import "./anthropic.js";
import "./openai.js";

// Re-export the registry API and shared types
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider } from "./types.js";
