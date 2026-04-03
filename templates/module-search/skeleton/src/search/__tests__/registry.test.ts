import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { SearchProvider, SearchProviderFactory } from "../providers/types.js";

// ── Registry Tests ────────────────────────────────────────────────
//
// Verifies the factory-based registry: each getProvider() call returns
// a new instance, factories can be registered and retrieved, and
// duplicate registration is rejected.
//

function stubFactory(name: string): SearchProviderFactory {
  return () => ({
    name,
    async init() {},
    async createIndex() {},
    async indexDocuments() {},
    async search() {
      return { hits: [], totalHits: 0, processingTimeMs: 0 };
    },
    async deleteDocuments() {},
    async getIndex() { return undefined; },
    async deleteIndex() {},
    async close() {},
  });
}

describe("search provider registry", () => {
  const unique = () =>
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and retrieves a provider instance by name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const provider = getProvider(name);
    expect(provider.name).toBe(name);
  });

  it("returns independent instances from each getProvider() call", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const a = getProvider(name);
    const b = getProvider(name);
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(/not found/);
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    expect(() => registerProvider(name, stubFactory(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, stubFactory(a));
    registerProvider(b, stubFactory(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("lists built-in providers after barrel import", async () => {
    await import("../providers/index.js");
    const names = listProviders();

    expect(names).toContain("algolia");
    expect(names).toContain("typesense");
    expect(names).toContain("meilisearch");
    expect(names).toContain("mock");
  });
});
