// ── Routing Strategy Barrel ──────────────────────────────────────────
//
// Importing this module causes all built-in routing strategy factories
// to self-register with the strategy registry. Custom strategies can
// be added by importing their module after this one.
//

import "./static.js";
import "./round-robin.js";
import "./latency.js";
import "./cost.js";
import "./adaptive.js";

export { registerStrategy, getStrategy, listStrategies } from "./registry.js";
export type { RoutingStrategyFactory } from "./registry.js";
export type { RoutingStrategy, RoutingContext } from "./types.js";
