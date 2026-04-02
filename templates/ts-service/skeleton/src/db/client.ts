import { getDriver } from "./drivers/registry.js";

// ── Import drivers so they self-register ─────────────────────────────
import "./drivers/postgres.js";
import "./drivers/sqlite.js";

// ── Database Client ──────────────────────────────────────────────────
//
// Resolves the configured database driver from the registry and
// connects. The driver name is read from DATABASE_URL (scheme) or
// can be overridden with DB_DRIVER.
//
// Usage:
//   const client = await connectDatabase();
//

function resolveDriverName(): string {
  if (process.env.DB_DRIVER) {
    return process.env.DB_DRIVER;
  }

  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) return "postgres";
  if (url.startsWith("sqlite")) return "sqlite";

  return "__DATABASE__";
}

export async function connectDatabase(): Promise<unknown> {
  const driverName = resolveDriverName();
  const connectionString = process.env.DATABASE_URL ?? "";

  const driver = getDriver(driverName);
  return driver.connect(connectionString);
}

export async function disconnectDatabase(): Promise<void> {
  const driverName = resolveDriverName();
  const driver = getDriver(driverName);
  await driver.disconnect();
}
