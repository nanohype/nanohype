import type { PaymentProvider } from "./types.js";

// ── Provider Registry ──────────────────────────────────────────────
//
// Central registry for payment provider factories. Each provider module
// self-registers by calling registerProvider() with a factory function
// at import time. Consumer code calls getProvider() to obtain a fresh
// instance with its own encapsulated state — no module-level mutable
// state leaks between callers.
//

export type PaymentProviderFactory = () => PaymentProvider;

const factories = new Map<string, PaymentProviderFactory>();

export function registerProvider(name: string, factory: PaymentProviderFactory): void {
  if (factories.has(name)) {
    throw new Error(`Payment provider "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getProvider(name: string): PaymentProvider {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Payment provider "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
