// ── Store Barrel ────────────────────────────────────────────────────
//
// Importing this module causes all built-in stores to self-register
// with the store registry. Custom stores can be added by importing
// their module after this one.
//

import "./memory.js";
import "./redis.js";
import "./json-file.js";
import "./mock.js";

export { registerStore, getStore, listStores } from "./registry.js";
export type { FlagStore } from "./types.js";
