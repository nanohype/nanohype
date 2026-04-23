// ── Provider Registry ──────────────────────────────────────────────
//
// Factory-based registry for knowledge base providers. Each provider
// module registers a factory function -- getProvider() returns a new
// instance every time, ensuring no shared mutable state between callers.
//
// This differs from singleton registries: each consumer gets its own
// circuit breaker, API client, and internal state.
//

import type { KnowledgeProvider, KnowledgeProviderFactory } from "./types.js";

const factories = new Map<string, KnowledgeProviderFactory>();

/**
 * Register a provider factory. Called by each provider module at
 * import time (self-registration pattern).
 */
export function registerProvider(name: string, factory: KnowledgeProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Knowledge provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * Create a new provider instance by name. Returns a fresh instance
 * with its own circuit breaker and API client state.
 */
export function getProvider(name: string): KnowledgeProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Knowledge provider "${name}" not found. Available: ${available}`);
  }
  return factory();
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return Array.from(factories.keys());
}
