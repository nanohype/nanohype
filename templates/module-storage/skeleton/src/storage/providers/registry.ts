import type { StorageProvider } from "./types.js";

// -- Provider Registry ---------------------------------------------------
//
// Central registry for storage providers. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a provider instance.
//

const providers = new Map<string, StorageProvider>();

export function registerProvider(provider: StorageProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(
      `Storage provider "${provider.name}" is already registered`
    );
  }
  providers.set(provider.name, provider);
}

export function getProvider(name: string): StorageProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Storage provider "${name}" not found. Available: ${available}`
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
