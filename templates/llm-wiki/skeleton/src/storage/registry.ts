import type { StorageProvider } from "./types.js";

export type StorageProviderFactory = () => StorageProvider;

const providers = new Map<string, StorageProviderFactory>();

export function registerStorageProvider(name: string, factory: StorageProviderFactory): void {
  providers.set(name, factory);
}

export function getStorageProvider(name: string): StorageProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ");
    throw new Error(
      `Storage provider "${name}" not registered. Available: ${available || "none"}`,
    );
  }
  return factory();
}

export function listStorageProviders(): string[] {
  return [...providers.keys()];
}
