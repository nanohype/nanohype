import type { VectorStoreProvider } from "./types.js";

// -- Provider Registry ---------------------------------------------------
//
// Central registry for vector store provider factories. Each provider
// module self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a fresh provider instance.
//

export type VectorStoreProviderFactory = () => VectorStoreProvider;

const factories = new Map<string, VectorStoreProviderFactory>();

export function registerProvider(name: string, factory: VectorStoreProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(
      `Vector store provider "${name}" is already registered`,
    );
  }
  factories.set(name, factory);
}

export function getProvider(name: string): VectorStoreProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Vector store provider "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
