// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one. On the nanohype substrate the
// gateway provider is the path to a model; off it, the bedrock provider
// calls Bedrock under an assumed IAM role. Neither holds a provider key.
//

// Scaffolded with DefaultProvider = __DEFAULT_PROVIDER__.
import "./gateway.js";
import "./bedrock.js";
import "./mock.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { GatewayProvider, ProviderPricing } from "./types.js";
