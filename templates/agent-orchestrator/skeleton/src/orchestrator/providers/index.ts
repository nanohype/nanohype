// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one. The gateway provider is the
// path to a model on the nanohype substrate; the API-key providers are part
// of a project scaffolded with IncludeKeyProviders, for an application that
// runs off it.
//

// Scaffolded with LlmProvider:IncludeKeyProviders = __PROVIDER_CHECK__.
import "./gateway.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
// #endif
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { LlmProvider } from "./types.js";
