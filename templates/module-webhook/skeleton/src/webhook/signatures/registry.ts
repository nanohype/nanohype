import type { SignatureProvider } from "./types.js";

// ── Signature Provider Registry ────────────────────────────────────
//
// Central registry for signature providers. Each provider module
// self-registers by calling registerSignatureProvider() at import
// time. Consumer code calls getSignatureProvider() to obtain the
// active provider.
//

const providers = new Map<string, SignatureProvider>();

export function registerSignatureProvider(provider: SignatureProvider): void {
  if (providers.has(provider.name)) {
    throw new Error(`Signature provider "${provider.name}" is already registered`);
  }
  providers.set(provider.name, provider);
}

export function getSignatureProvider(name: string): SignatureProvider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(", ") || "(none)";
    throw new Error(
      `Signature provider "${name}" not found. Available: ${available}`,
    );
  }
  return provider;
}

export function listSignatureProviders(): string[] {
  return Array.from(providers.keys());
}
