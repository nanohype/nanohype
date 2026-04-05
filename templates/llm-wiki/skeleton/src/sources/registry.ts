import type { SourceProvider } from "./types.js";

export type SourceProviderFactory = () => SourceProvider;

const providers = new Map<string, SourceProviderFactory>();

export function registerSourceProvider(name: string, factory: SourceProviderFactory): void {
  providers.set(name, factory);
}

export function getSourceProvider(name: string): SourceProvider {
  const factory = providers.get(name);
  if (!factory) {
    const available = [...providers.keys()].join(", ");
    throw new Error(
      `Source provider "${name}" not registered. Available: ${available || "none"}`,
    );
  }
  return factory();
}

export function listSourceProviders(): string[] {
  return [...providers.keys()];
}
