// ── Agent Registry ──────────────────────────────────────────────────
//
// Factory-based registry for agents. Each agent module self-registers
// by calling registerAgent() at import time with a factory function.
// Consumer code calls getAgent() to obtain a fresh agent instance by
// name. Factory pattern ensures no module-level mutable agent
// instances — each getAgent() call produces an independent instance.
//

import type { Agent } from "./types.js";

const factories = new Map<string, () => Agent>();

/**
 * Register an agent factory under the given name.
 * Called at module load time by each agent module.
 */
export function registerAgent(name: string, factory: () => Agent): void {
  if (factories.has(name)) {
    throw new Error(`Agent "${name}" is already registered`);
  }
  factories.set(name, factory);
}

/**
 * Retrieve an agent by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getAgent(name: string): Agent {
  const factory = factories.get(name);
  if (!factory) {
    const available = Array.from(factories.keys()).join(", ") || "(none)";
    throw new Error(
      `Agent "${name}" not found. Available: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered agents.
 */
export function listAgents(): string[] {
  return Array.from(factories.keys());
}

/**
 * Get all registered agent factories for routing introspection.
 * Returns agent instances so the router can inspect capabilities.
 */
export function getAllAgents(): Agent[] {
  return Array.from(factories.values()).map((factory) => factory());
}
