// ── Provider Registry ────────────────────────────────────────────────
//
// Central registry that maps provider names to provider instances.
// Providers self-register at import time by calling `registerProvider`.
// The middleware looks up providers here by name.

import type { AuthProvider } from "./types.js";

const providers = new Map<string, AuthProvider>();

/**
 * Register an auth provider. Called by each provider module at import
 * time. If a provider with the same name is already registered, the
 * new one replaces it (useful for testing or overrides).
 */
export function registerProvider(provider: AuthProvider): void {
  providers.set(provider.name, provider);
}

/**
 * Retrieve a registered provider by name.
 * Returns undefined if no provider with that name has been registered.
 */
export function getProvider(name: string): AuthProvider | undefined {
  return providers.get(name);
}

/**
 * List all registered provider names. Useful for diagnostics and
 * error messages that suggest valid provider names.
 */
export function listProviders(): string[] {
  return Array.from(providers.keys());
}
