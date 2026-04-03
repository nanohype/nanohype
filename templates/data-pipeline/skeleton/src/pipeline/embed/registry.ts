import type { EmbeddingProvider } from "./types.js";

// ── Embedding Provider Registry ────────────────────────────────────
//
// Factory-based registry for embedding providers. Each provider module
// self-registers by calling registerEmbeddingProvider() at import
// time. Consumer code calls getEmbeddingProvider() to obtain a
// provider by name.
//

const providers = new Map<string, (...args: unknown[]) => EmbeddingProvider>();

export function registerEmbeddingProvider(
  name: string,
  factory: (...args: unknown[]) => EmbeddingProvider,
): void {
  if (providers.has(name)) {
    throw new Error(`Embedding provider "${name}" is already registered`);
  }
  providers.set(name, factory);
}

export function getEmbeddingProvider(name: string, ...args: unknown[]): EmbeddingProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Embedding provider "${name}" not found. Available: ${available}`,
    );
  }
  return factory(...args);
}

export function listEmbeddingProviders(): string[] {
  return Array.from(providers.keys());
}
