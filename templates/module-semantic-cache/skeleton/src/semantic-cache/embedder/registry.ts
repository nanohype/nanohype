import type { EmbeddingProvider } from "./types.js";

// ── Embedding Provider Registry ────────────────────────────────────
//
// Central registry for embedding providers. Each provider module
// self-registers a factory by calling registerEmbeddingProvider() at
// import time. getEmbeddingProvider() invokes the factory, so every
// createSemanticCache() call gets a fresh provider instance (its own
// circuit breaker and SDK client).
//

export type EmbeddingProviderFactory = () => EmbeddingProvider;

const factories = new Map<string, EmbeddingProviderFactory>();

export function registerEmbeddingProvider(
  name: string,
  factory: EmbeddingProviderFactory,
): void {
  if (factories.has(name)) {
    throw new Error(`Embedding provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getEmbeddingProvider(name: string): EmbeddingProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Embedding provider "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listEmbeddingProviders(): string[] {
  return Array.from(factories.keys());
}
