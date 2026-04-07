import type { GatewayProvider } from "./types.js";

// ── Provider Registry ───────────────────────────────────────────────
//
// Central registry for LLM provider factories. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a fresh provider instance.
//

export type GatewayProviderFactory = () => GatewayProvider;

const factories = new Map<string, GatewayProviderFactory>();

export function registerProvider(name: string, factory: GatewayProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Gateway provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getProvider(name: string): GatewayProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Gateway provider "${name}" not found. Available: ${available}`);
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
