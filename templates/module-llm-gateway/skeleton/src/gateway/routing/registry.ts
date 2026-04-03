import type { RoutingStrategy } from "./types.js";

// ── Routing Strategy Registry ───────────────────────────────────────
//
// Central registry for routing strategy factories. Each strategy module
// self-registers by calling registerStrategy() with a factory function
// at import time. Consumer code calls getStrategy() to obtain a fresh
// instance with its own encapsulated state.
//

export type RoutingStrategyFactory = () => RoutingStrategy;

const factories = new Map<string, RoutingStrategyFactory>();

export function registerStrategy(name: string, factory: RoutingStrategyFactory): void {
  if (factories.has(name)) {
    throw new Error(`Routing strategy "${name}" is already registered`);
  }
  factories.set(name, factory);
}

export function getStrategy(name: string): RoutingStrategy {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(`Routing strategy "${name}" not found. Available: ${available}`);
  }
  return factory();
}

export function listStrategies(): string[] {
  return Array.from(factories.keys());
}
