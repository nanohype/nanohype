import { describe, it, expect } from "vitest";
import {
  registerStore,
  getStore,
  listStores,
} from "../stores/registry.js";
import type { FlagStore } from "../stores/types.js";

/**
 * Build a minimal stub store for testing the registry in isolation.
 */
function stubStore(name: string): FlagStore {
  return {
    name,
    async init() {},
    async getFlag() { return undefined; },
    async setFlag() {},
    async listFlags() { return []; },
    async deleteFlag() {},
    async close() {},
  };
}

describe("flag store registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a store factory and retrieves an instance by name", () => {
    const name = unique();
    registerStore(name, () => stubStore(name));

    const store = getStore(name);
    expect(store.name).toBe(name);
  });

  it("returns a new instance on each getStore call (factory pattern)", () => {
    const name = unique();
    registerStore(name, () => stubStore(name));

    const a = getStore(name);
    const b = getStore(name);
    expect(a).not.toBe(b);
  });

  it("throws when retrieving an unregistered store", () => {
    expect(() => getStore("nonexistent-store")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate store name", () => {
    const name = unique();
    registerStore(name, () => stubStore(name));

    expect(() => registerStore(name, () => stubStore(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered store names", () => {
    const a = unique();
    const b = unique();

    registerStore(a, () => stubStore(a));
    registerStore(b, () => stubStore(b));

    const names = listStores();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
