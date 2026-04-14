// ── Provider Registry ────────────────────────────────────────────────
//
// Central registry that maps provider names to factory functions.
// Built-in providers self-register at import time; consumers may call
// `registerProvider` to add custom ones. `getProvider` always returns a
// fresh instance via the factory so tests can swap implementations.

import type { OAuthProvider } from "./types.js";

export type OAuthProviderFactory = () => OAuthProvider;

const factories = new Map<string, OAuthProviderFactory>();

export function registerProvider(name: string, factory: OAuthProviderFactory): void {
  factories.set(name, factory);
}

export function getProvider(name: string): OAuthProvider | undefined {
  const factory = factories.get(name);
  return factory ? factory() : undefined;
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}

/** Exposed for tests that want a clean slate. */
export function _clearRegistry(): void {
  factories.clear();
}
