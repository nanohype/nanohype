import type { ChunkStrategy } from "./types.js";

// ── Chunk Strategy Registry ────────────────────────────────────────
//
// Factory-based registry for chunking strategies. Each strategy module
// self-registers by calling registerStrategy() at import time.
// Consumer code calls getStrategy() to obtain a strategy by name.
//

const strategies = new Map<string, () => ChunkStrategy>();

export function registerStrategy(name: string, factory: () => ChunkStrategy): void {
  if (strategies.has(name)) {
    throw new Error(`Chunk strategy "${name}" is already registered`);
  }
  strategies.set(name, factory);
}

export function getStrategy(name: string): ChunkStrategy {
  const factory = strategies.get(name);
  if (!factory) {
    const available = Array.from(strategies.keys()).join(", ") || "(none)";
    throw new Error(
      `Chunk strategy "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

export function listStrategies(): string[] {
  return Array.from(strategies.keys());
}
