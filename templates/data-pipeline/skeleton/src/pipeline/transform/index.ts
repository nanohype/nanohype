/**
 * Barrel export for transform strategies.
 *
 * Re-exports registry functions and types, then imports each strategy
 * module to trigger self-registration as a side effect.
 */

export {
  getStrategy,
  listStrategies,
  registerStrategy,
} from "./registry.js";
export type { ChunkOptions, ChunkStrategy } from "./types.js";

// Import strategy modules to trigger registration
import "./recursive.js";
import "./fixed-size.js";
import "./semantic.js";
