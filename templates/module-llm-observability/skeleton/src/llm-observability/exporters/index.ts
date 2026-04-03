/**
 * Exporter abstraction layer.
 *
 * Importing this module registers all built-in exporters as a side
 * effect, making them available through getExporter() / listExporters().
 * The active exporter is selected at runtime by passing the exporter
 * name (set via the __EXPORTER__ placeholder) to getExporter().
 */

// Side-effect imports: each module calls registerExporter() at load time
import "./console.js";
import "./otlp.js";
import "./json-file.js";
import "./mock.js";

// Re-export the public API
export { registerExporter, getExporter, listExporters } from "./registry.js";
export type { LlmExporter } from "./types.js";
