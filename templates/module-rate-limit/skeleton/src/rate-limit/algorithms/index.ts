// ── Algorithm Barrel ────────────────────────────────────────────────
//
// Importing this module causes all built-in algorithms to self-register
// with the algorithm registry. Custom algorithms can be added by
// importing their module after this one.
//

import "./token-bucket.js";
import "./sliding-window.js";
import "./fixed-window.js";

export { registerAlgorithm, getAlgorithm, listAlgorithms } from "./registry.js";
export type { RateLimitAlgorithm } from "./types.js";
