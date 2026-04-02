/**
 * LLM provider registry for multimodal analysis.
 *
 * Each provider module registers itself as a side effect of being
 * imported. The registry is the single place to look up providers
 * by name at runtime.
 */

import type { MultimodalLlmProvider } from "./types.js";

const providers = new Map<string, (...args: unknown[]) => MultimodalLlmProvider>();

export function registerProvider(
  name: string,
  factory: (...args: unknown[]) => MultimodalLlmProvider,
): void {
  providers.set(name, factory);
}

export function getProvider(name: string, ...args: unknown[]): MultimodalLlmProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ") || "(none)";
    throw new Error(`Unknown LLM provider "${name}". Registered providers: ${available}`);
  }
  return factory(...args);
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
