// ── Database Module ─────────────────────────────────────────────────
//
// Main entry point for the database module. Re-exports the public API:
//
//   createDatabase(config)    — connect to a database, returns Drizzle instance
//   getDb()                   — singleton accessor (lazy-initializes from env)
//   disconnectDatabase()      — graceful shutdown
//
// Drivers self-register on import through the client module, so all
// bundled drivers (postgres, sqlite, turso) are available by default.
//

export { validateBootstrap } from "./bootstrap.js";
export { createDatabase, disconnectDatabase, getDb } from "./client.js";
export { getDriver, listDrivers, registerDriver } from "./drivers/registry.js";
export * as schema from "./schema.js";
export type { DatabaseConfig, DatabaseDriver } from "./types.js";
