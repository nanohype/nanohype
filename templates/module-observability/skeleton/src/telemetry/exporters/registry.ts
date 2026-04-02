import type { TelemetryExporter } from "./types.js";

/**
 * Exporter registry. Each exporter module registers itself as a
 * side effect of being imported, making the registry the single
 * place to look up a TelemetryExporter by name at runtime.
 */

const exporters = new Map<string, () => TelemetryExporter>();

/**
 * Register an exporter factory under the given name.
 * Called at module load time by each exporter module.
 */
export function registerExporter(
  name: string,
  factory: () => TelemetryExporter,
): void {
  exporters.set(name, factory);
}

/**
 * Retrieve an exporter by name, creating it via its factory.
 * Throws if the name has not been registered.
 */
export function getExporter(name: string): TelemetryExporter {
  const factory = exporters.get(name);
  if (!factory) {
    const available = [...exporters.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown telemetry exporter "${name}". Registered exporters: ${available}`,
    );
  }
  return factory();
}

/**
 * List the names of all registered exporters.
 */
export function listExporters(): string[] {
  return [...exporters.keys()];
}
