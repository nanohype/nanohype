/**
 * Tests for the provider registries.
 *
 * Verifies register/get/list behavior for all three registries:
 * LLM, embedding, and vector store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLlmProvider,
  getLlmProvider,
  listLlmProviders,
  registerEmbeddingProvider,
  getEmbeddingProvider,
  listEmbeddingProviders,
  registerVectorStoreProvider,
  getVectorStoreProvider,
  listVectorStoreProviders,
} from "../providers/registry.js";
import type { LlmProvider, EmbeddingProvider, VectorStoreProvider } from "../providers/types.js";

const mockLlm: LlmProvider = {
  async generate() {
    return { answer: "test", usage: { total_tokens: 10 } };
  },
};

const mockEmbedder: EmbeddingProvider = {
  dimensions: 4,
  async embed() {
    return [0.1, 0.1, 0.1, 0.1];
  },
  async embedBatch(texts: string[]) {
    return texts.map(() => [0.1, 0.1, 0.1, 0.1]);
  },
};

const mockVectorStore: VectorStoreProvider = {
  async init() {},
  async addDocuments() {},
  async search() {
    return [];
  },
  async delete() {},
};

describe("LLM Registry", () => {
  it("registers and retrieves a provider", () => {
    registerLlmProvider("test-llm", () => mockLlm);
    const provider = getLlmProvider("test-llm");
    expect(provider).toBe(mockLlm);
  });

  it("lists registered providers", () => {
    registerLlmProvider("test-llm-list", () => mockLlm);
    const providers = listLlmProviders();
    expect(providers).toContain("test-llm-list");
  });

  it("throws on unknown provider", () => {
    expect(() => getLlmProvider("nonexistent-llm")).toThrow("Unknown LLM provider");
  });
});

describe("Embedding Registry", () => {
  it("registers and retrieves a provider", () => {
    registerEmbeddingProvider("test-embed", () => mockEmbedder);
    const provider = getEmbeddingProvider("test-embed");
    expect(provider).toBe(mockEmbedder);
  });

  it("lists registered providers", () => {
    registerEmbeddingProvider("test-embed-list", () => mockEmbedder);
    const providers = listEmbeddingProviders();
    expect(providers).toContain("test-embed-list");
  });

  it("throws on unknown provider", () => {
    expect(() => getEmbeddingProvider("nonexistent-embed")).toThrow(
      "Unknown embedding provider",
    );
  });
});

describe("Vector Store Registry", () => {
  it("registers and retrieves a provider", () => {
    registerVectorStoreProvider("test-vs", () => mockVectorStore);
    const provider = getVectorStoreProvider("test-vs");
    expect(provider).toBe(mockVectorStore);
  });

  it("lists registered providers", () => {
    registerVectorStoreProvider("test-vs-list", () => mockVectorStore);
    const providers = listVectorStoreProviders();
    expect(providers).toContain("test-vs-list");
  });

  it("throws on unknown provider", () => {
    expect(() => getVectorStoreProvider("nonexistent-vs")).toThrow(
      "Unknown vector store provider",
    );
  });
});
