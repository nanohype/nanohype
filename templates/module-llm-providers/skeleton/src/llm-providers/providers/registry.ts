// ── Provider Registry ──────────────────────────────────────────────
//
// Factory-based registry for LLM providers. Each provider module
// registers a factory function, and getProvider() calls it on every
// lookup.
//
// Each built-in provider registers a factory that returns one instance,
// built as its module loads, so the instance's circuit breaker, SDK
// client and log-once state hold across every request in the process. A
// factory that builds an instance per call gives each caller its own.
//

import type { LlmProvider, LlmProviderFactory } from "./types.js";

const factories = new Map<string, LlmProviderFactory>();

/**
 * Register a provider factory. Called by each provider module at
 * import time (self-registration pattern).
 */
export function registerProvider(name: string, factory: LlmProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`LLM provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * The provider instance the factory registered under `name` returns.
 */
export function getProvider(name: string): LlmProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`LLM provider "${name}" not found. Available: ${available}`);
  }
  return factory();
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return Array.from(factories.keys());
}
