import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// ── Drizzle Kit Configuration ───────────────────────────────────────
//
// Used by drizzle-kit for schema introspection, migration generation,
// and Drizzle Studio. The dialect and connection details are resolved
// from environment variables so the same config works across drivers.
//
// Usage:
//   npm run db:generate   — generate migration files from schema changes
//   npm run db:studio     — open Drizzle Studio for visual browsing
//
// See: https://orm.drizzle.team/kit-docs/config-reference
//

function resolveDialect(): "postgresql" | "sqlite" | "turso" {
  const driver = process.env.DB_DRIVER ?? "__DATABASE_DRIVER__";
  if (driver === "postgres") return "postgresql";
  if (driver === "turso") return "turso";
  return "sqlite";
}

function resolveConnection(): Record<string, unknown> {
  const dialect = resolveDialect();
  const url = process.env.DATABASE_URL;

  if (dialect === "turso") {
    return {
      url: url ?? "file:local.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  if (dialect === "postgresql") {
    return { url: url ?? "postgres://localhost:5432/__PROJECT_NAME__" };
  }

  // sqlite
  return { url: url ?? "file:local.db" };
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: resolveDialect(),
  dbCredentials: resolveConnection() as never,
});
