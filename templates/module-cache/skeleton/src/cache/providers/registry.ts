import type { CacheProvider } from "./types.js";

// ── Provider Registry ───────────────────────────────────────────────
//
// Central registry for cache providers. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain the active provider.
//

const providers = new Map<string, CacheProvider>();

export function registerProvider(provider: CacheProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(`Cache provider "${provider.name}" is already registered`);
  }
  providers.set(provider.name, provider);
}

export function getProvider(name: string): CacheProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Cache provider "${name}" not found. Available: ${available}`
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
