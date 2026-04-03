import type { EmbeddingProvider } from "./types.js";

// ── Embedding Provider Registry ────────────────────────────────────
//
// Central registry for embedding providers. Each provider module
// self-registers by calling registerEmbeddingProvider() at import
// time. Consumer code calls getEmbeddingProvider() to obtain the
// active provider.
//

const providers = new Map<string, EmbeddingProvider>();

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(`Embedding provider "${provider.name}" is already registered`);
  }
  providers.set(provider.name, provider);
}

export function getEmbeddingProvider(name: string): EmbeddingProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Embedding provider "${name}" not found. Available: ${available}`,
    );
  }
  return provider;
}

export function listEmbeddingProviders(): string[] {
  return Array.from(providers.keys());
}
