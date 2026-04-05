import type { LlmProvider } from "./types.js";

export type LlmProviderFactory = () => LlmProvider;

const providers = new Map<string, LlmProviderFactory>();

export function registerLlmProvider(name: string, factory: LlmProviderFactory): void {
  providers.set(name, factory);
}

export function getLlmProvider(name: string): LlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ");
    throw new Error(
      `LLM provider "${name}" not registered. Available: ${available || "none"}`,
    );
  }
  return factory();
}

export function listLlmProviders(): string[] {
  return [...providers.keys()];
}
