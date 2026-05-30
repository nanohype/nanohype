import { describe, it, expect } from "vitest";
import {
  registerVectorStore,
  getVectorStore,
  listVectorStores,
} from "../store/registry.js";
import type { VectorCacheStore } from "../store/types.js";

/**
 * Build a minimal stub store for testing the registry in isolation.
 */
function stubStore(name: string): VectorCacheStore {
  return {
    name,
    async init() {},
    async upsert() {},
    async search() {
      return undefined;
    },
    async delete() {},
    async count() {
      return 0;
    },
    async close() {},
  };
}

describe("vector store registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and resolves it by name", () => {
    const name = unique();
    const store = stubStore(name);

    registerVectorStore(name, () => store);

    expect(getVectorStore(name)).toBe(store);
  });

  it("invokes the factory on every get, yielding fresh instances", () => {
    const name = unique();

    registerVectorStore(name, () => stubStore(name));

    const first = getVectorStore(name);
    const second = getVectorStore(name);
    expect(first).not.toBe(second);
  });

  it("throws when retrieving an unregistered store", () => {
    expect(() => getVectorStore("nonexistent-store")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate store name", () => {
    const name = unique();
    registerVectorStore(name, () => stubStore(name));

    expect(() => registerVectorStore(name, () => stubStore(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered store names", () => {
    const a = unique();
    const b = unique();

    registerVectorStore(a, () => stubStore(a));
    registerVectorStore(b, () => stubStore(b));

    const names = listVectorStores();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
