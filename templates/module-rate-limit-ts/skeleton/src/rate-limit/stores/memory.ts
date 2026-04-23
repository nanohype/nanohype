import type { RateLimitStore, StoreConfig } from "./types.js";
import { registerStore } from "./registry.js";

// ── In-Memory Store ────────────────────────────────────────────────
//
// A Map-backed store suitable for development and testing. All data
// is stored in-process and lost on restart. Entries are cleaned up
// when their TTL expires. No external dependencies required.
//

interface Entry {
  value: string;
  expiresAt: number | null;
}

interface ListEntry {
  values: string[];
  expiresAt: number | null;
}

const data = new Map<string, Entry>();
const lists = new Map<string, ListEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function isExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  return Date.now() >= expiresAt;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of data) {
    if (entry.expiresAt !== null && now >= entry.expiresAt) {
      data.delete(key);
    }
  }
  for (const [key, entry] of lists) {
    if (entry.expiresAt !== null && now >= entry.expiresAt) {
      lists.delete(key);
    }
  }
}

const memoryStore: RateLimitStore = {
  name: "memory",

  async init(_config: StoreConfig): Promise<void> {
    // Start periodic cleanup every 10 seconds
    if (!cleanupTimer) {
      cleanupTimer = setInterval(pruneExpired, 10_000);
      // Unref so the timer doesn't prevent process exit
      if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
        cleanupTimer.unref();
      }
    }
  },

  async get(key: string): Promise<string | null> {
    const entry = data.get(key);
    if (!entry) return null;
    if (isExpired(entry.expiresAt)) {
      data.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl : null;
    data.set(key, { value, expiresAt });
  },

  async increment(key: string, ttl?: number): Promise<number> {
    const existing = data.get(key);

    if (!existing || isExpired(existing.expiresAt)) {
      const expiresAt = ttl ? Date.now() + ttl : null;
      data.set(key, { value: "1", expiresAt });
      return 1;
    }

    const newValue = parseInt(existing.value, 10) + 1;
    existing.value = String(newValue);
    return newValue;
  },

  async getList(key: string): Promise<string[]> {
    const entry = lists.get(key);
    if (!entry) return [];
    if (isExpired(entry.expiresAt)) {
      lists.delete(key);
      return [];
    }
    return [...entry.values];
  },

  async appendList(key: string, value: string, ttl?: number): Promise<void> {
    const existing = lists.get(key);

    if (!existing || isExpired(existing.expiresAt)) {
      const expiresAt = ttl ? Date.now() + ttl : null;
      lists.set(key, { values: [value], expiresAt });
      return;
    }

    existing.values.push(value);
    // Refresh TTL on append if provided
    if (ttl) {
      existing.expiresAt = Date.now() + ttl;
    }
  },

  async delete(key: string): Promise<void> {
    data.delete(key);
    lists.delete(key);
  },

  async close(): Promise<void> {
    data.clear();
    lists.clear();
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  },
};

// Self-register
registerStore(memoryStore);
