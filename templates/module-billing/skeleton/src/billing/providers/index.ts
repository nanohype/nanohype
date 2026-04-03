// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in provider factories to
// self-register with the provider registry. Consumer code calls
// getProvider(name) to obtain a fresh instance from the factory.
// Custom providers can be added by importing their module after this one.
//

import "./stripe.js";
import "./mock.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { PaymentProviderFactory } from "./registry.js";
export type { PaymentProvider } from "./types.js";
