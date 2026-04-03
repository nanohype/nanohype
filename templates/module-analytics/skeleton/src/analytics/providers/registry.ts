// ── Provider Registry ──────────────────────────────────────────────
//
// Factory-based registry for analytics providers. Each provider module
// registers a factory function -- getProvider() returns a new instance
// every time, ensuring no shared mutable state between callers.
//
// This differs from singleton registries: each consumer gets its own
// circuit breaker, API client, and event buffer state.
//

import type { AnalyticsProvider, AnalyticsProviderFactory } from "./types.js";

const factories = new Map<string, AnalyticsProviderFactory>();

/**
 * Register a provider factory. Called by each provider module at
 * import time (self-registration pattern).
 */
export function registerProvider(name: string, factory: AnalyticsProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Analytics provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * Create a new provider instance by name. Returns a fresh instance
 * with its own circuit breaker and API client state.
 */
export function getProvider(name: string): AnalyticsProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Analytics provider "${name}" not found. Available: ${available}`);
  }
  return factory();
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return Array.from(factories.keys());
}
