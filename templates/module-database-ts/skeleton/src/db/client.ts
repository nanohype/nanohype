import { validateBootstrap } from "./bootstrap.js";
import type { DatabaseConfig } from "./types.js";
import { getDriver } from "./drivers/registry.js";

// ── Import drivers so they self-register ─────────────────────────────
import "./drivers/postgres.js";
import "./drivers/sqlite.js";
import "./drivers/turso.js";

// ── Singleton Database Client ───────────────────────────────────────
//
// Manages a single database connection for the lifetime of the
// process. The connection is established lazily on first call to
// getDb() or explicitly via createDatabase().
//
// Usage:
//   // Explicit — returns the Drizzle instance
//   const db = await createDatabase({ driver: "postgres", url: "..." });
//
//   // Singleton — lazy-inits from environment if not yet connected
//   const db = await getDb();
//

let instance: unknown = null;
let activeDriver: string | null = null;

/**
 * Connect to a database using the named driver and return a Drizzle
 * ORM instance. Stores the connection as the module singleton so
 * subsequent calls to getDb() return the same instance.
 */
export async function createDatabase(config: DatabaseConfig): Promise<unknown> {
  validateBootstrap();

  if (instance) {
    await disconnectDatabase();
  }

  const driver = getDriver(config.driver);
  instance = await driver.connect(config.url, config.options);
  activeDriver = config.driver;
  return instance;
}

/**
 * Returns the singleton Drizzle instance. If no connection has been
 * established, lazily connects using environment variables:
 *
 * - DB_DRIVER   — driver name (falls back to DATABASE_URL scheme, then "__DATABASE_DRIVER__")
 * - DATABASE_URL — connection string or file path
 */
export async function getDb(): Promise<unknown> {
  if (instance) {
    return instance;
  }

  const driverName = resolveDriverName();
  const url = process.env.DATABASE_URL ?? "";

  return createDatabase({ driver: driverName, url });
}

/**
 * Gracefully close the active database connection and clear the
 * singleton so a new connection can be established later.
 */
export async function disconnectDatabase(): Promise<void> {
  if (activeDriver && instance) {
    const driver = getDriver(activeDriver);
    await driver.disconnect();
    instance = null;
    activeDriver = null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function resolveDriverName(): string {
  if (process.env.DB_DRIVER) {
    return process.env.DB_DRIVER;
  }

  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) return "postgres";
  if (url.startsWith("libsql") || url.startsWith("https://") || url.includes("turso")) {
    return "turso";
  }
  if (url.startsWith("file:") || url.startsWith("sqlite")) return "sqlite";

  return "__DATABASE_DRIVER__";
}
