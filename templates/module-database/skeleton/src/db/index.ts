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

export { createDatabase, getDb, disconnectDatabase } from "./client.js";
export { type DatabaseConfig, type DatabaseDriver } from "./types.js";
export { registerDriver, getDriver, listDrivers } from "./drivers/registry.js";
export * as schema from "./schema.js";
