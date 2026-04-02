import type { LlmProvider } from "./types.js";

/**
 * Provider registry. Each provider module registers itself as a
 * side effect of being imported, making the registry the single
 * place to look up an LlmProvider by name at runtime.
 */

const providers = new Map<string, () => LlmProvider>();

/**
 * Register a provider factory under the given name.
 * Called at module load time by each provider module.
 */
export function registerProvider(
  name: string,
  factory: () => LlmProvider,
): void {
  providers.set(name, factory);
}

/**
 * Retrieve a provider by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getProvider(name: string): LlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown LLM provider "${name}". Registered providers: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered providers.
 */
export function listProviders(): string[] {
  return [...providers.keys()];
}
