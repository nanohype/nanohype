import type { CachingStrategy } from "./types.js";

// ── Caching Strategy Registry ───────────────────────────────────────
//
// Central registry for caching strategy factories. Each strategy module
// self-registers by calling registerCachingStrategy() with a factory
// function at import time. Consumer code calls getCachingStrategy() to
// obtain a fresh instance with its own encapsulated state.
//

export type CachingStrategyFactory = () => CachingStrategy;

const factories = new Map<string, CachingStrategyFactory>();

export function registerCachingStrategy(name: string, factory: CachingStrategyFactory): void {
  if (factories.has(name)) {
    throw new Error(`Caching strategy "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getCachingStrategy(name: string): CachingStrategy {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Caching strategy "${name}" not found. Available: ${available}`);
  }
  return factory();
}

export function listCachingStrategies(): string[] {
  return Array.from(factories.keys());
}
