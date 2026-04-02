import type { LlmProvider } from "./types.js";

/**
 * Provider registry. Each provider module registers itself at import time
 * with a factory function, so adding a new provider is just "create a file,
 * register it" -- no switch statements or central wiring needed.
 */

const providers = new Map<string, () => LlmProvider>();

/**
 * Register a provider factory under the given name.
 * Called at the bottom of each provider module.
 */
export function registerProvider(
  name: string,
  factory: () => LlmProvider,
): void {
  providers.set(name, factory);
}

/**
 * Retrieve and instantiate a provider by name.
 * Throws if the name has not been registered.
 */
export function getProvider(name: string): LlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = listProviders().join(", ");
    throw new Error(
      `Unknown LLM provider: "${name}". Registered: ${available || "(none)"}`,
    );
  }
  return factory();
}

/**
 * List all registered provider names.
 */
export function listProviders(): string[] {
  return [...providers.keys()];
}
