// ── Store Registry ──────────────────────────────────────────────────
//
// Factory-based registry for flag stores. Each store module
// self-registers by calling registerStore() at import time with a
// factory function. Consumer code calls getStore() to obtain a fresh
// store instance by name.
//
// Factory pattern ensures no module-level mutable store instances —
// each getStore() call produces an independent instance.
//

import type { FlagStore } from "./types.js";

const factories = new Map<string, () => FlagStore>();

/**
 * Register a store factory under the given name.
 * Called at module load time by each store module.
 */
export function registerStore(name: string, factory: () => FlagStore): void {
  if (factories.has(name)) {
    throw new Error(`Flag store "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * Retrieve a store by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getStore(name: string): FlagStore {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Flag store "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered stores.
 */
export function listStores(): string[] {
  return Array.from(factories.keys());
}
