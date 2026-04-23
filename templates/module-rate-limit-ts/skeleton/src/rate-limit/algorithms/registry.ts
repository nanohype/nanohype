import type { RateLimitAlgorithm } from "./types.js";

// ── Algorithm Registry ─────────────────────────────────────────────
//
// Central registry for rate limiting algorithms. Each algorithm module
// self-registers by calling registerAlgorithm() at import time.
// Consumer code calls getAlgorithm() to obtain the active algorithm.
//

const algorithms = new Map<string, RateLimitAlgorithm>();

export function registerAlgorithm(algorithm: RateLimitAlgorithm): void {
  if (algorithms.has(algorithm.name)) {
    throw new Error(`Rate limit algorithm "${algorithm.name}" is already registered`);
  }
  algorithms.set(algorithm.name, algorithm);
}

export function getAlgorithm(name: string): RateLimitAlgorithm {
  const algorithm = algorithms.get(name);
  if (!algorithm) {
    const available = Array.from(algorithms.keys()).join(", ") || "(none)";
    throw new Error(
      `Rate limit algorithm "${name}" not found. Available: ${available}`,
    );
  }
  return algorithm;
}

export function listAlgorithms(): string[] {
  return Array.from(algorithms.keys());
}
