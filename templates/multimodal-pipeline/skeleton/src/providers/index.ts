/**
 * Barrel export for providers.
 *
 * Re-exports registry functions and types, then imports each provider
 * module to trigger self-registration as a side effect.
 */

export type { MultimodalLlmProvider, AnalysisResult } from "./types.js";

export {
  registerProvider,
  getProvider,
  listProviders,
} from "./registry.js";

export {
  registerTranscriptionProvider,
  getTranscriptionProvider,
} from "./whisper.js";

export type {
  TranscriptionProvider,
  TranscriptionResult,
} from "./whisper.js";

// Import provider modules to trigger registration
import "./anthropic.js";
import "./openai.js";
import "./mock.js";
import "./whisper.js";
