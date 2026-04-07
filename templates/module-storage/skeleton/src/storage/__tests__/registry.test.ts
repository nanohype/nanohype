import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { StorageProvider } from "../providers/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): StorageProvider {
  return {
    name,
    async init() {},
    async upload() {},
    async download() {
      return Buffer.from("");
    },
    async delete() {},
    async list() {
      return { objects: [] };
    },
    async getSignedUrl() {
      return "https://stub";
    },
  };
}

describe("storage provider registry", () => {
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
