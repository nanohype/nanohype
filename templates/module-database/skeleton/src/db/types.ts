// ── Database Types ───────────────────────────────────────────────────
//
// Core types for the database module. DatabaseConfig carries connection
// details, and DatabaseDriver is re-exported from the drivers layer for
// convenience.
//

export { type DatabaseDriver } from "./drivers/types.js";

/**
 * Configuration passed to createDatabase() to establish a connection.
 *
 * - `driver`  — registered driver name (e.g. "postgres", "sqlite", "turso")
 * - `url`     — connection string or file path
 * - `options` — driver-specific overrides (pool size, auth tokens, etc.)
 */
export interface DatabaseConfig {
  /** Driver name to resolve from the registry. */
  driver: string;

  /** Connection URL or file path. */
  url: string;

  /** Arbitrary driver-specific options. */
  options?: Record<string, unknown>;
}
