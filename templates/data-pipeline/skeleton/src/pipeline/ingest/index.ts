/**
 * Barrel export for ingest sources.
 *
 * Re-exports registry functions and types, then imports each source
 * module to trigger self-registration as a side effect.
 */

export {
  getSource,
  listSources,
  registerSource,
} from "./registry.js";
export type { IngestSource } from "./types.js";

// Import source modules to trigger registration
import "./file.js";
import "./web.js";
