// ── Provider Barrel ─────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by calling
// registerProvider() after this import.
//

import "./segment.js";
import "./posthog.js";
import "./mixpanel.js";
import "./amplitude.js";
import "./mock.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { AnalyticsProvider, AnalyticsProviderFactory } from "./types.js";
