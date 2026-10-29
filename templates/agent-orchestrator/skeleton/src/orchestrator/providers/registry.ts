// ── Provider Registry ───────────────────────────────────────────────
//
// Factory-based registry for LLM providers. Each provider module
// self-registers by calling registerProvider() at import time with a
// factory function, and getProvider() returns what that factory gives.
// A stateless provider such as mock builds a fresh instance per lookup;
// the gateway provider's factory returns one instance, because its
// circuit breaker has to see every call to the gateway to open.
//

import type { LlmProvider } from "./types.js";

const factories = new Map<string, () => LlmProvider>();

/**
 * Register a provider factory under the given name.
 * Called at module load time by each provider module.
 */
export function registerProvider(name: string, factory: () => LlmProvider): void {
  if (factories.has(name)) {
    throw new Error(`LLM provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * Retrieve a provider by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getProvider(name: string): LlmProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`LLM provider "${name}" not found. Available: ${available}`);
  }
  return factory();
}

/**
 * List the names of all registered providers.
 */
export function listProviders(): string[] {
  return Array.from(factories.keys());
}
