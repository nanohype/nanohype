import type { LlmExporter } from "./types.js";

// ── Exporter Registry ──────────────────────────────────────────────
//
// Factory-based registry for LLM exporters. Each exporter module
// registers a factory function that creates new exporter instances.
// Consumers call getExporter(name) to get a fresh instance — no
// module-level mutable exporter state is shared.
//

const factories = new Map<string, () => LlmExporter>();

/**
 * Register an exporter factory under the given name.
 * Called at module load time by each exporter module.
 */
export function registerExporter(
  name: string,
  factory: () => LlmExporter,
): void {
  factories.set(name, factory);
}

/**
 * Retrieve an exporter by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getExporter(name: string): LlmExporter {
  const factory = factories.get(name);
  if (!factory) {
    const available = [...factories.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown LLM exporter "${name}". Registered exporters: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered exporters.
 */
export function listExporters(): string[] {
  return [...factories.keys()];
}
