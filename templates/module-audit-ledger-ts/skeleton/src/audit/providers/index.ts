// ── Adapter Barrel ──────────────────────────────────────────────────
//
// Importing this module imports every built-in adapter for its
// self-registration side effect, then re-exports the registry API.
//

import "./memory.js";
import "./postgres.js";
import "./dynamodb.js";
import "./sqs.js";

export { getProvider, listProviders, registerProvider } from "./registry.js";
export type { AuditAdapterFactory } from "./registry.js";
export type { AuditAdapter } from "./types.js";
