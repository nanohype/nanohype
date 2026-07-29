/**
 * Barrel export for providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export {
  getProvider,
  listProviders,
  registerProvider,
} from "./registry.js";
export type { AnalysisResult, MultimodalLlmProvider } from "./types.js";
export type {
  TranscriptionProvider,
  TranscriptionResult,
} from "./whisper.js";
export {
  getTranscriptionProvider,
  registerTranscriptionProvider,
} from "./whisper.js";

// Import provider modules to trigger registration
import "./anthropic.js";
import "./openai.js";
import "./mock.js";
import "./whisper.js";
