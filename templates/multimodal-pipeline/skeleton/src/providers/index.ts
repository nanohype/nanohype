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

// Import provider modules to trigger registration. The gateway provider is
// the path to a model on the nanohype substrate; the anthropic and openai
// providers are part of a project scaffolded with IncludeKeyProviders, for a
// pipeline that runs off it.
// Scaffolded with LlmProvider:IncludeKeyProviders = __PROVIDER_CHECK__.
import "./gateway.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
// #endif
import "./mock.js";
import "./whisper.js";
