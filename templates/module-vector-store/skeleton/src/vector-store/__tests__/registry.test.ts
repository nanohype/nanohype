import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { VectorStoreProvider } from "../providers/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): VectorStoreProvider {
  return {
    name,
    async init() {},
    async upsert() {},
    async query() {
      return [];
    },
    async delete() {},
    async count() {
      return 0;
    },
    async close() {},
  };
}

describe("vector store provider registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and retrieves a provider by name", () => {
    const name = unique();

    registerProvider(name, () => stubProvider(name));

    const result = getProvider(name);
    expect(result.name).toBe(name);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(name, () => stubProvider(name));

    expect(() => registerProvider(name, () => stubProvider(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, () => stubProvider(a));
    registerProvider(b, () => stubProvider(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("returns a fresh instance on each getProvider call", () => {
    const name = unique();

    registerProvider(name, () => stubProvider(name));

    const a = getProvider(name);
    const b = getProvider(name);
    expect(a).not.toBe(b);
    expect(a.name).toBe(name);
  });
});
