// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one. The gateway provider is the
// path to a model on the nanohype substrate, and holds no model credential.
//

// Scaffolded with LlmProvider = __LLM_PROVIDER__.
import "./gateway.js";
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider } from "./types.js";
