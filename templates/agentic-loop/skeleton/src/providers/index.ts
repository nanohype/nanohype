/**
 * Provider abstraction layer.
 *
 * Importing this module registers all built-in providers as a side
 * effect, making them available through getProvider() / listProviders().
 * The active provider is selected at runtime by passing the provider
 * name (set via the __LLM_PROVIDER__ placeholder) to getProvider().
 */

// Side-effect imports: each module calls registerProvider() at load time.
// The gateway provider is the path to a model on the nanohype substrate.
// The API-key providers are part of a project scaffolded with
// IncludeKeyProviders, for an application that runs off it.
import "./gateway.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
// #endif
import "./mock.js";

// Re-export the public API
export { getProvider, listProviders, registerProvider } from "./registry.js";
export type {
  ContentBlock,
  LlmProvider,
  LlmResponse,
  Message,
  StreamChat,
  TokenUsage,
  ToolCall,
  ToolCallMessage,
} from "./types.js";
