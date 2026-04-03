/**
 * Barrel export for ingest sources.
 *
 * Re-exports registry functions and types, then imports each source
 * module to trigger self-registration as a side effect.
 */

export type { IngestSource } from "./types.js";

export {
  registerSource,
  getSource,
  listSources,
} from "./registry.js";

// Import source modules to trigger registration
import "./file.js";
import "./web.js";
