import type { StorageProvider } from "./types.js";

// -- Provider Registry ---------------------------------------------------
//
// Central registry for storage provider factories. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a fresh provider instance.
//

export type StorageProviderFactory = () => StorageProvider;

const factories = new Map<string, StorageProviderFactory>();

export function registerProvider(name: string, factory: StorageProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(
      `Storage provider "${name}" is already registered`
    );
  }
  factories.set(name, factory);
}

export function getProvider(name: string): StorageProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Storage provider "${name}" not found. Available: ${available}`
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
