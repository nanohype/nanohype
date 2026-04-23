import type { RateLimitStore } from "./types.js";

// ── Store Registry ─────────────────────────────────────────────────
//
// Central registry for rate limit stores. Each store module
// self-registers by calling registerStore() at import time.
// Consumer code calls getStore() to obtain the active store.
//

const stores = new Map<string, RateLimitStore>();

export function registerStore(store: RateLimitStore): void {
  if (stores.has(store.name)) {
    throw new Error(`Rate limit store "${store.name}" is already registered`);
  }
  stores.set(store.name, store);
}

export function getStore(name: string): RateLimitStore {
  const store = stores.get(name);
  if (!store) {
    const available = Array.from(stores.keys()).join(", ") || "(none)";
    throw new Error(
      `Rate limit store "${name}" not found. Available: ${available}`,
    );
  }
  return store;
}

export function listStores(): string[] {
  return Array.from(stores.keys());
}
