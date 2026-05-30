import type { VectorCacheStore } from "./types.js";

// ── Vector Store Registry ──────────────────────────────────────────
//
// Central registry for vector cache store backends. Each store module
// self-registers a factory by calling registerVectorStore() at import
// time. getVectorStore() invokes the factory, so every
// createSemanticCache() call gets a fresh, isolated backend instance.
//

export type VectorStoreFactory = () => VectorCacheStore;

const factories = new Map<string, VectorStoreFactory>();

export function registerVectorStore(name: string, factory: VectorStoreFactory): void {
  if (factories.has(name)) {
    throw new Error(`Vector store "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getVectorStore(name: string): VectorCacheStore {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Vector store "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listVectorStores(): string[] {
  return Array.from(factories.keys());
}
