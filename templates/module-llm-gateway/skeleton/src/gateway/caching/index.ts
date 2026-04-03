// ── Caching Strategy Barrel ──────────────────────────────────────────
//
// Importing this module causes all built-in caching strategy factories
// to self-register with the caching strategy registry. Custom strategies
// can be added by importing their module after this one.
//

import "./hash.js";
import "./sliding-ttl.js";
import "./none.js";

export {
  registerCachingStrategy,
  getCachingStrategy,
  listCachingStrategies,
} from "./registry.js";
export type { CachingStrategyFactory } from "./registry.js";
export type { CachingStrategy, CacheContext, CachedResponse } from "./types.js";
