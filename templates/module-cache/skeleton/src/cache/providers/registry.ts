import type { CacheProvider } from "./types.js";

// ── Provider Registry ───────────────────────────────────────────────
//
// Central registry for cache provider factories. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a fresh provider instance.
//

export type CacheProviderFactory = () => CacheProvider;

const factories = new Map<string, CacheProviderFactory>();

export function registerProvider(name: string, factory: CacheProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Cache provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getProvider(name: string): CacheProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Cache provider "${name}" not found. Available: ${available}`
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
