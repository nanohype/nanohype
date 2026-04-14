import type { OutputAdapter } from "./types.js";

// ── Output Adapter Registry ────────────────────────────────────────
//
// Factory-based registry for output adapters. Each adapter module
// self-registers by calling registerAdapter() at import time.
// Consumer code calls getAdapter() to obtain an adapter by name.
//

const adapters = new Map<string, () => OutputAdapter>();

export function registerAdapter(name: string, factory: () => OutputAdapter): void {
  if (adapters.has(name)) {
    throw new Error(`Output adapter "${name}" is already registered`);
  }
  adapters.set(name, factory);
}

export function getAdapter(name: string): OutputAdapter {
  const factory = adapters.get(name);
  if (!factory) {
    const available = Array.from(adapters.keys()).join(", ") || "(none)";
    throw new Error(
      `Output adapter "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}
