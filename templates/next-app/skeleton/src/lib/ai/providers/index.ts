// The gateway provider is the path to a model on the nanohype substrate.
// The anthropic and openai providers, which authenticate with a provider
// key, are part of a project scaffolded with IncludeKeyProviders, for an app
// that runs off it.
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
// #endif
import "./gateway.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { AiProvider, ChatMessage } from "./types.js";
