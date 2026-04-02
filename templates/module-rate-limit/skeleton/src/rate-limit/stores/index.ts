// ── Store Barrel ────────────────────────────────────────────────────
//
// Importing this module causes all built-in stores to self-register
// with the store registry. Custom stores can be added by importing
// their module after this one.
//

import "./memory.js";
import "./redis.js";

export { registerStore, getStore, listStores } from "./registry.js";
export type { RateLimitStore, StoreConfig } from "./types.js";
