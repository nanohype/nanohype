/**
 * LLM provider registry for multimodal analysis.
 *
 * Each provider module registers itself as a side effect of being
 * imported. The registry is the single place to look up providers
 * by name at runtime.
 */

import type { MultimodalLlmProvider } from "./types.js";

/** Builds a provider, or returns the one instance a provider module registered. */
export type AnalysisProviderFactory = () => MultimodalLlmProvider;

const providers = new Map<string, AnalysisProviderFactory>();

export function registerProvider(name: string, factory: AnalysisProviderFactory): void {
  providers.set(name, factory);
}

export function getProvider(name: string): MultimodalLlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ") || "(none)";
    throw new Error(`Unknown LLM provider "${name}". Registered providers: ${available}`);
  }
  return factory();
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
