/**
 * Tests for all four registries: ingest sources, transform strategies,
 * embedding providers, and output adapters.
 *
 * Verifies that built-in providers are registered and that error
 * handling works for unknown providers.
 */

import { describe, it, expect } from "vitest";
import { getSource, listSources } from "../ingest/index.js";
import { getStrategy, listStrategies } from "../transform/index.js";
import { getEmbeddingProvider, listEmbeddingProviders } from "../embed/index.js";
import { getAdapter, listAdapters } from "../output/index.js";

describe("Ingest Source Registry", () => {
  it("lists registered sources", () => {
    const sources = listSources();
    expect(sources).toContain("file");
    expect(sources).toContain("web");
  });

  it("retrieves the file source", () => {
    const source = getSource("file");
    expect(source.name).toBe("file");
  });

  it("retrieves the web source", () => {
    const source = getSource("web");
    expect(source.name).toBe("web");
  });

  it("throws on unknown source", () => {
    expect(() => getSource("nonexistent")).toThrow("Ingest source");
  });
});

describe("Transform Strategy Registry", () => {
  it("lists registered strategies", () => {
    const strategies = listStrategies();
    expect(strategies).toContain("recursive");
    expect(strategies).toContain("fixed");
    expect(strategies).toContain("semantic");
  });

  it("retrieves the recursive strategy", () => {
    const strategy = getStrategy("recursive");
    expect(strategy.name).toBe("recursive");
  });

  it("retrieves the fixed strategy", () => {
    const strategy = getStrategy("fixed");
    expect(strategy.name).toBe("fixed");
  });

  it("retrieves the semantic strategy", () => {
    const strategy = getStrategy("semantic");
    expect(strategy.name).toBe("semantic");
  });

  it("throws on unknown strategy", () => {
    expect(() => getStrategy("nonexistent")).toThrow("Chunk strategy");
  });
});

describe("Embedding Provider Registry", () => {
  it("lists registered providers", () => {
    const providers = listEmbeddingProviders();
    expect(providers).toContain("openai");
    expect(providers).toContain("mock");
  });

  it("retrieves the mock provider", () => {
    const provider = getEmbeddingProvider("mock");
    expect(provider.name).toBe("mock");
    expect(provider.dimensions).toBe(128);
  });

  it("throws on unknown provider", () => {
    expect(() => getEmbeddingProvider("nonexistent")).toThrow("Embedding provider");
  });
});

describe("Output Adapter Registry", () => {
  it("lists registered adapters", () => {
    const adapters = listAdapters();
    expect(adapters).toContain("json-file");
    expect(adapters).toContain("console");
  });

  it("retrieves the json-file adapter", () => {
    const adapter = getAdapter("json-file");
    expect(adapter.name).toBe("json-file");
  });

  it("retrieves the console adapter", () => {
    const adapter = getAdapter("console");
    expect(adapter.name).toBe("console");
  });

  it("throws on unknown adapter", () => {
    expect(() => getAdapter("nonexistent")).toThrow("Output adapter");
  });
});
