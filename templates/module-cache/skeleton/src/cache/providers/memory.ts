import type { CacheConfig } from "../types.js";
import type { CacheProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── In-Memory Cache Provider ────────────────────────────────────────
//
// A simple Map-backed cache suitable for development and testing.
// Entries are stored in memory and lost on process exit. Supports
// TTL via lazy expiration — expired entries are evicted on access.
// No external dependencies required.
//

interface StoredEntry {
  value: string;
  expiresAt: number | null;
}

const store = new Map<string, StoredEntry>();

function isExpired(entry: StoredEntry): boolean {
  return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
}

const memoryProvider: CacheProvider = {
  name: "memory",

  async init(_config: CacheConfig): Promise<void> {
    // No setup needed for in-memory provider
  },

  async get(key: string): Promise<string | undefined> {
    const entry = store.get(key);
    if (!entry) return undefined;

    if (isExpired(entry)) {
      store.delete(key);
      return undefined;
    }

    return entry.value;
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expiresAt = ttl !== undefined && ttl > 0 ? Date.now() + ttl : null;
    store.set(key, { value, expiresAt });
  },

  async delete(key: string): Promise<void> {
    store.delete(key);
  },

  async has(key: string): Promise<boolean> {
    const entry = store.get(key);
    if (!entry) return false;

    if (isExpired(entry)) {
      store.delete(key);
      return false;
    }

    return true;
  },

  async clear(): Promise<void> {
    store.clear();
  },

  async close(): Promise<void> {
    store.clear();
  },
};

// Self-register
registerProvider("memory", () => memoryProvider);
