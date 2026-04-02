import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// ── Database Client ─────────────────────────────────────────────────
//
// Creates a Drizzle ORM client connected to Postgres. Uses the
// DATABASE_URL environment variable for connection configuration.
//
// Usage:
//   import { db } from "@/lib/db/client";
//   const rows = await db.select().from(schema.conversations);
//

const connectionString = process.env.DATABASE_URL ?? "";

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
