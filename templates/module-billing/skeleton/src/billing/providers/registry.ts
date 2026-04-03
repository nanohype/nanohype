import type { PaymentProvider } from "./types.js";

// ── Provider Registry ──────────────────────────────────────────────
//
// Central registry for payment providers. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain the active provider.
//

const providers = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(`Payment provider "${provider.name}" is already registered`);
  }
  providers.set(provider.name, provider);
}

export function getProvider(name: string): PaymentProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Payment provider "${name}" not found. Available: ${available}`,
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
