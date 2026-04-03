import type { VectorCacheStore } from "./types.js";

// ── Vector Store Registry ──────────────────────────────────────────
//
// Central registry for vector cache store backends. Each store module
// self-registers by calling registerVectorStore() at import time.
// Consumer code calls getVectorStore() to obtain the active backend.
//

const stores = new Map<string, VectorCacheStore>();

export function registerVectorStore(store: VectorCacheStore): void {
  if (stores.has(store.name)) {
    throw new Error(`Vector store "${store.name}" is already registered`);
  }
  stores.set(store.name, store);
}

export function getVectorStore(name: string): VectorCacheStore {
  const store = stores.get(name);
  if (!store) {
    const available = Array.from(stores.keys()).join(", ") || "(none)";
    throw new Error(
      `Vector store "${name}" not found. Available: ${available}`,
    );
  }
  return store;
}

export function listVectorStores(): string[] {
  return Array.from(stores.keys());
}
