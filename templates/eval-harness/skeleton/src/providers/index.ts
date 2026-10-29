/**
 * Provider abstraction layer.
 *
 * Importing this module triggers side-effect registration of all built-in
 * providers. To add a custom provider, create a new file that calls
 * registerProvider() and import it here.
 */

// Side-effect imports — each module registers itself on load. The bedrock
// provider calls Bedrock under the IAM role the run assumes, for a run on a
// CI runner or a workstation. The gateway provider calls the Platform's
// ModelGateway and holds no credential, for a run inside the cluster.
// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./bedrock.js";
import "./gateway.js";
import "./mock.js";

// Re-export the registry API and shared types
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { ChatMessage, LlmProvider } from "./types.js";

/**
 * Default provider configured at scaffold time.
 */
export const DEFAULT_PROVIDER = "__LLM_PROVIDER__";
