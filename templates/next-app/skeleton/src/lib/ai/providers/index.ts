// The gateway provider is the path to a model on the nanohype substrate,
// and holds no model credential. A custom provider registers itself here.
// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./gateway.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { AiProvider, ChatMessage } from "./types.js";
