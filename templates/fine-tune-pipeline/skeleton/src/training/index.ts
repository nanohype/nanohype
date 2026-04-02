/**
 * Training provider abstraction layer.
 *
 * Importing this module triggers side-effect registration of all built-in
 * providers. To add a custom provider, create a new file that calls
 * registerProvider() and import it here.
 */

// Side-effect imports — each module registers itself on load
import "./openai.js";

// Re-export the registry API and shared types
export { registerProvider, getProvider, listProviders } from "./registry.js";
export type {
  TrainingProvider,
  TrainingJobConfig,
  TrainingJobStatus,
} from "./types.js";

/**
 * Default provider configured at scaffold time.
 */
export const DEFAULT_PROVIDER = "__PROVIDER__";
