import { describe, it, expect } from "vitest";
import {
  registerAlgorithm,
  getAlgorithm,
  listAlgorithms,
} from "../algorithms/registry.js";
import {
  registerStore,
  getStore,
  listStores,
} from "../stores/registry.js";
import type { RateLimitAlgorithm } from "../algorithms/types.js";
import type { RateLimitStore } from "../stores/types.js";

/**
 * Build a minimal stub algorithm for testing the registry in isolation.
 */
function stubAlgorithm(name: string): RateLimitAlgorithm {
  return {
    name,
    async check() {
      return { allowed: true, remaining: 0, resetAt: 0, limit: 0 };
    },
    async reset() {},
  };
}

/**
 * Build a minimal stub store for testing the registry in isolation.
 */
function stubStore(name: string): RateLimitStore {
  return {
    name,
    async init() {},
    async get() {
      return null;
    },
    async set() {},
    async increment() {
      return 1;
    },
    async getList() {
      return [];
    },
    async appendList() {},
    async delete() {},
    async close() {},
  };
}

describe("algorithm registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers an algorithm and retrieves it by name", () => {
    const name = unique();
    const algorithm = stubAlgorithm(name);

    registerAlgorithm(algorithm);

    expect(getAlgorithm(name)).toBe(algorithm);
  });

  it("throws when retrieving an unregistered algorithm", () => {
    expect(() => getAlgorithm("nonexistent-algorithm")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate algorithm name", () => {
    const name = unique();
    registerAlgorithm(stubAlgorithm(name));

    expect(() => registerAlgorithm(stubAlgorithm(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered algorithm names", () => {
    const a = unique();
    const b = unique();

    registerAlgorithm(stubAlgorithm(a));
    registerAlgorithm(stubAlgorithm(b));

    const names = listAlgorithms();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});

describe("store registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a store and retrieves it by name", () => {
    const name = unique();
    const store = stubStore(name);

    registerStore(store);

    expect(getStore(name)).toBe(store);
  });

  it("throws when retrieving an unregistered store", () => {
    expect(() => getStore("nonexistent-store")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate store name", () => {
    const name = unique();
    registerStore(stubStore(name));

    expect(() => registerStore(stubStore(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered store names", () => {
    const a = unique();
    const b = unique();

    registerStore(stubStore(a));
    registerStore(stubStore(b));

    const names = listStores();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
