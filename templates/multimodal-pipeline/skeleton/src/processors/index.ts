/**
 * Barrel export for processors.
 *
 * Re-exports registry functions and types, then imports each processor
 * module to trigger self-registration as a side effect.
 */

export {
  getProcessorByMimeType,
  getProcessorByModality,
  listProcessors,
  listSupportedMimeTypes,
  registerProcessor,
} from "./registry.js";
export type { Modality, ProcessedInput, Processor } from "./types.js";

// Import processor modules to trigger registration
import "./image.js";
// #if IncludeAudio
import "./audio.js";
// #endif
// #if IncludeVideo
import "./video.js";
// #endif
