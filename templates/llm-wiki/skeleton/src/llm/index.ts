// The gateway provider is the path to a model on the nanohype substrate,
// and holds no model credential.
// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./gateway.js";
import "./mock.js";

export {
  getLlmProvider,
  listLlmProviders,
  registerLlmProvider,
} from "./registry.js";

export type { LlmMessage, LlmOptions, LlmProvider } from "./types.js";
