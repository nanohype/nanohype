import type { AiProvider } from "./types";

export type AiProviderFactory = () => AiProvider;

const factories = new Map<string, AiProviderFactory>();

export function registerProvider(name: string, factory: AiProviderFactory): void {
  factories.set(name, factory);
}

export function getProvider(name: string): AiProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = [...factories.keys()].join(", ");
    throw new Error(`Unknown AI provider: "${name}". Available: ${available}`);
  }
  return factory();
}

export function listProviders(): string[] {
  return [...factories.keys()];
}
