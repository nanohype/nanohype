// ── Provider Registry ────────────────────────────────────────────────
//
// Central registry that maps provider names to factory functions.
// Providers self-register at import time by calling `registerProvider`.
// The middleware looks up providers here by name — each call to
// `getProvider` returns a fresh instance via the factory.

import type { AuthProvider } from "./types.js";

export type AuthProviderFactory = () => AuthProvider;

const factories = new Map<string, AuthProviderFactory>();

/**
 * Register an auth provider factory. Called by each provider module at
 * import time. If a provider with the same name is already registered,
 * the new one replaces it (useful for testing or overrides).
 */
export function registerProvider(name: string, factory: AuthProviderFactory): void {
  factories.set(name, factory);
}

/**
 * Retrieve a registered provider by name, returning a fresh instance.
 * Returns undefined if no provider with that name has been registered.
 */
export function getProvider(name: string): AuthProvider | undefined {
  const factory = factories.get(name);
  return factory ? factory() : undefined;
}

/**
 * List all registered provider names. Useful for diagnostics and
 * error messages that suggest valid provider names.
 */
export function listProviders(): string[] {
  return Array.from(factories.keys());
}
