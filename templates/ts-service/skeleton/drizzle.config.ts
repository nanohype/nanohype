import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// ── Drizzle Kit Configuration ───────────────────────────────────────
//
// Used by drizzle-kit for schema introspection, migration generation,
// and Drizzle Studio. Connection details are resolved from environment
// variables so the same config works across environments.
//
// Usage:
//   npm run db:generate   — generate migration files from schema changes
//   npm run db:migrate    — apply pending migrations
//   npm run db:push       — push schema directly (dev convenience)
//   npm run db:studio     — open Drizzle Studio for visual browsing
//
// See: https://orm.drizzle.team/kit-docs/config-reference
//

function resolveDialect(): "postgresql" | "sqlite" {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("sqlite")) return "sqlite";
  return "postgresql";
}

function resolveUrl(): string {
  const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/__PROJECT_NAME__";
  if (url.startsWith("sqlite://")) return url.slice("sqlite://".length);
  if (url.startsWith("sqlite:")) return url.slice("sqlite:".length);
  return url;
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: resolveDialect(),
  dbCredentials: {
    url: resolveUrl(),
  },
});
