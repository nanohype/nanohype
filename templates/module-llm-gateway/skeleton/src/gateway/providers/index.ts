// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one. The API-key providers are part
// of a project scaffolded with IncludeKeyProviders, for an application
// that runs off the nanohype substrate; on it, the gateway provider is
// the path to a model.
//

// Scaffolded with DefaultProvider:IncludeKeyProviders = __PROVIDER_CHECK__.
import "./gateway.js";
import "./bedrock.js";
// #if IncludeKeyProviders
import "./anthropic.js";
import "./openai.js";
import "./groq.js";
// #endif
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { GatewayProvider, ProviderPricing } from "./types.js";
