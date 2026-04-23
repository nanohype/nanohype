// ── Provider Barrel ──────────────────────────────────────────────────
//
// Importing this module causes all built-in providers to self-register
// with the provider registry. Custom providers can be added by
// importing their module after this one.
//

import "./memory.js";
import "./redis.js";
import "./memcached.js";

export { registerProvider, getProvider, listProviders } from "./registry.js";
export type { CacheProvider } from "./types.js";
