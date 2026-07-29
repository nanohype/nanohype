// ── Driver Barrel ───────────────────────────────────────────────────
//
// Importing this module loads all bundled drivers, causing them to
// self-register with the driver registry. Also re-exports the
// registry API and driver interface for external consumption.
//

import "./postgres.js";
import "./sqlite.js";
import "./turso.js";

export { getDriver, listDrivers, registerDriver } from "./registry.js";
export type { DatabaseDriver } from "./types.js";
