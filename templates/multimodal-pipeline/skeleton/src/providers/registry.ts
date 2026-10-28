/**
 * LLM provider registry for multimodal analysis.
 *
 * Each provider module registers itself as a side effect of being
 * imported. The registry is the single place to look up providers
 * by name at runtime.
 */

import type { MultimodalLlmProvider } from "./types.js";

/**
 * Builds a provider. `apiKey` is the key its requests carry; a provider
 * that needs one reads its own environment variable when it is unset.
 */
export type AnalysisProviderFactory = (apiKey?: string) => MultimodalLlmProvider;

const providers = new Map<string, AnalysisProviderFactory>();

export function registerProvider(name: string, factory: AnalysisProviderFactory): void {
  providers.set(name, factory);
}

export function getProvider(name: string, apiKey?: string): MultimodalLlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ") || "(none)";
    throw new Error(`Unknown LLM provider "${name}". Registered providers: ${available}`);
  }
  return factory(apiKey);
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
