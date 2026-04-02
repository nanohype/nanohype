/**
 * Triple provider registry for LLM generation, embedding, and
 * vector store backends.
 *
 * Each provider module registers itself as a side effect of being
 * imported. The registry is the single place to look up providers
 * by name at runtime.
 */

import type { LlmProvider, EmbeddingProvider, VectorStoreProvider } from "./types.js";

// ── LLM Registry ──────────────────────────────────────────────────

const llmProviders = new Map<string, (...args: unknown[]) => LlmProvider>();

export function registerLlmProvider(
  name: string,
  factory: (...args: unknown[]) => LlmProvider,
): void {
  llmProviders.set(name, factory);
}

export function getLlmProvider(name: string, ...args: unknown[]): LlmProvider {
  const factory = llmProviders.get(name);
  if (!factory) {
    const available = [...llmProviders.keys()].join(", ") || "(none)";
    throw new Error(`Unknown LLM provider "${name}". Registered providers: ${available}`);
  }
  return factory(...args);
}

export function listLlmProviders(): string[] {
  return [...llmProviders.keys()];
}

// ── Embedding Registry ────────────────────────────────────────────

const embeddingProviders = new Map<string, (...args: unknown[]) => EmbeddingProvider>();

export function registerEmbeddingProvider(
  name: string,
  factory: (...args: unknown[]) => EmbeddingProvider,
): void {
  embeddingProviders.set(name, factory);
}

export function getEmbeddingProvider(name: string, ...args: unknown[]): EmbeddingProvider {
  const factory = embeddingProviders.get(name);
  if (!factory) {
    const available = [...embeddingProviders.keys()].join(", ") || "(none)";
    throw new Error(`Unknown embedding provider "${name}". Registered providers: ${available}`);
  }
  return factory(...args);
}

export function listEmbeddingProviders(): string[] {
  return [...embeddingProviders.keys()];
}

// ── Vector Store Registry ─────────────────────────────────────────

const vectorStoreProviders = new Map<string, (...args: unknown[]) => VectorStoreProvider>();

export function registerVectorStoreProvider(
  name: string,
  factory: (...args: unknown[]) => VectorStoreProvider,
): void {
  vectorStoreProviders.set(name, factory);
}

export function getVectorStoreProvider(name: string, ...args: unknown[]): VectorStoreProvider {
  const factory = vectorStoreProviders.get(name);
  if (!factory) {
    const available = [...vectorStoreProviders.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown vector store provider "${name}". Registered providers: ${available}`,
    );
  }
  return factory(...args);
}

export function listVectorStoreProviders(): string[] {
  return [...vectorStoreProviders.keys()];
}
