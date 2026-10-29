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
// #if IncludeAudio
export type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionSettings,
} from "./transcribe.js";
export {
  getTranscriptionProvider,
  registerTranscriptionProvider,
} from "./transcribe.js";
// #endif
export type { AnalysisResult, MultimodalLlmProvider } from "./types.js";

// Import provider modules to trigger registration. The gateway provider is
// the path to a model on the nanohype substrate, and the bedrock provider
// calls Bedrock directly under the AWS credential chain, for a pipeline that
// runs off it. Neither holds a provider key.
// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./gateway.js";
import "./bedrock.js";
import "./mock.js";
// #if IncludeAudio
import "./transcribe.js";
// #endif
