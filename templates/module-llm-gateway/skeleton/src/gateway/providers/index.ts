// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one.
//

import "./anthropic.js";
import "./openai.js";
import "./groq.js";
import "./mock.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { GatewayProvider, ProviderPricing } from "./types.js";
