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

  it("registers a provider and retrieves it by name", () => {
    const name = unique();
    const provider = stubProvider(name);

    registerProvider(provider);

    expect(getProvider(name)).toBe(provider);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(stubProvider(name));

    expect(() => registerProvider(stubProvider(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(stubProvider(a));
    registerProvider(stubProvider(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
