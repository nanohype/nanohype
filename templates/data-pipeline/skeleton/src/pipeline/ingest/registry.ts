import type { IngestSource } from "./types.js";

// ── Ingest Source Registry ─────────────────────────────────────────
//
// Factory-based registry for ingest sources. Each source module
// self-registers by calling registerSource() at import time.
// Consumer code calls getSource() to obtain a source by name.
//

const sources = new Map<string, () => IngestSource>();

export function registerSource(name: string, factory: () => IngestSource): void {
  if (sources.has(name)) {
    throw new Error(`Ingest source "${name}" is already registered`);
  }
  sources.set(name, factory);
}

export function getSource(name: string): IngestSource {
  const factory = sources.get(name);
  if (!factory) {
    const available = Array.from(sources.keys()).join(", ") || "(none)";
    throw new Error(
      `Ingest source "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listSources(): string[] {
  return Array.from(sources.keys());
}
