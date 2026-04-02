import type { QueueProvider } from "./types.js";

// ── Provider Registry ───────────────────────────────────────────────
//
// Central registry for queue providers. Each provider module
// self-registers by calling registerProvider() at import time.
// Consumer code calls getProvider() to obtain the active provider.
//

const providers = new Map<string, QueueProvider>();

export function registerProvider(provider: QueueProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(`Queue provider "${provider.name}" is already registered`);
  }
  providers.set(provider.name, provider);
}

export function getProvider(name: string): QueueProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Queue provider "${name}" not found. Available: ${available}`
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
