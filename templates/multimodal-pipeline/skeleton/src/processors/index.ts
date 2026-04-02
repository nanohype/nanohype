/**
 * Barrel export for processors.
 *
 * Re-exports registry functions and types, then imports each processor
 * module to trigger self-registration as a side effect.
 */

export type { Processor, ProcessedInput, Modality } from "./types.js";

export {
  registerProcessor,
  getProcessorByMimeType,
  getProcessorByModality,
  listProcessors,
  listSupportedMimeTypes,
} from "./registry.js";

// Import processor modules to trigger registration
import "./image.js";
import "./audio.js";
import "./video.js";
