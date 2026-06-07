import type { AuditAdapter } from "./types.js";

// ── Adapter Registry ────────────────────────────────────────────────
//
// Central registry for audit adapter factories. Each adapter module
// self-registers by calling registerProvider() at import time. Consumer
// code calls getProvider() to obtain a fresh adapter instance.
//

export type AuditAdapterFactory = () => AuditAdapter;

const factories = new Map<string, AuditAdapterFactory>();

export function registerProvider(name: string, factory: AuditAdapterFactory): void {
  if (factories.has(name)) {
    throw new Error(`Audit adapter "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getProvider(name: string): AuditAdapter {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Audit adapter "${name}" not found. Available: ${available}`);
  }
  return factory();
}

export function listProviders(): string[] {
  return Array.from(factories.keys());
}
