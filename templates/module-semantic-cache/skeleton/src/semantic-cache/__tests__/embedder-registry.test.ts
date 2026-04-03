import { describe, it, expect } from "vitest";
import {
  registerEmbeddingProvider,
  getEmbeddingProvider,
  listEmbeddingProviders,
} from "../embedder/registry.js";
import type { EmbeddingProvider } from "../embedder/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): EmbeddingProvider {
  return {
    name,
    dimensions: 8,
    async embed() {
      return new Array(8).fill(0);
    },
    async embedBatch(texts: string[]) {
      return texts.map(() => new Array(8).fill(0));
    },
  };
}

describe("embedding provider registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a provider and retrieves it by name", () => {
    const name = unique();
    const provider = stubProvider(name);

    registerEmbeddingProvider(provider);

    expect(getEmbeddingProvider(name)).toBe(provider);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getEmbeddingProvider("nonexistent-embedder")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerEmbeddingProvider(stubProvider(name));

    expect(() => registerEmbeddingProvider(stubProvider(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerEmbeddingProvider(stubProvider(a));
    registerEmbeddingProvider(stubProvider(b));

    const names = listEmbeddingProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
