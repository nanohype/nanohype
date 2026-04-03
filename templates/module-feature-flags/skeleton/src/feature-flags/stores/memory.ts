import type { Flag } from "../types.js";
import type { FlagStore } from "./types.js";
import { registerStore } from "./registry.js";

// ── In-Memory Flag Store ────────────────────────────────────────────
//
// A Map-backed flag store suitable for development and testing.
// Flags are stored in memory and lost on process exit. Each
// factory call produces an independent store instance — no
// module-level mutable state is shared between instances.
//

function createMemoryStore(): FlagStore {
  const store = new Map<string, Flag>();

  return {
    name: "memory",

    async init(): Promise<void> {
      // No setup needed for in-memory store
    },

    async getFlag(key: string): Promise<Flag | undefined> {
      return store.get(key);
    },

    async setFlag(flag: Flag): Promise<void> {
      store.set(flag.key, { ...flag, updatedAt: new Date().toISOString() });
    },

    async listFlags(): Promise<Flag[]> {
      return Array.from(store.values());
    },

    async deleteFlag(key: string): Promise<void> {
      store.delete(key);
    },

    async close(): Promise<void> {
      store.clear();
    },
  };
}

// Self-register
registerStore("memory", createMemoryStore);
