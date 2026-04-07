import type { QueueProvider } from "./types.js";

// ── Provider Registry ───────────────────────────────────────────────
//
// Central registry for queue provider factories. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain a fresh provider instance.
//

export type QueueProviderFactory = () => QueueProvider;

const factories = new Map<string, QueueProviderFactory>();

export function registerProvider(name: string, factory: QueueProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Queue provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getProvider(name: string): QueueProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Queue provider "${name}" not found. Available: ${available}`
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
