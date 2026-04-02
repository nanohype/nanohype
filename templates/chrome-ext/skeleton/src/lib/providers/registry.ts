import type { AiProvider } from "./types.js";

const providers = new Map<string, AiProvider>();

export function registerProvider(name: string, provider: AiProvider): void {
  providers.set(name, provider);
}

export function getProvider(name: string): AiProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = [...providers.keys()].join(", ");
    throw new Error(`Unknown AI provider: "${name}". Available: ${available}`);
  }
  return provider;
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
