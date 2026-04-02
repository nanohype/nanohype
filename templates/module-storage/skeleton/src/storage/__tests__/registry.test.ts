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
