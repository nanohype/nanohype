/**
 * Barrel export for output adapters.
 *
 * Re-exports registry functions and types, then imports each adapter
 * module to trigger self-registration as a side effect.
 */

export type { OutputAdapter, OutputAdapterConfig } from "./types.js";

export {
  registerAdapter,
  getAdapter,
  listAdapters,
} from "./registry.js";

// Import adapter modules to trigger registration
import "./json-file.js";
import "./console.js";
