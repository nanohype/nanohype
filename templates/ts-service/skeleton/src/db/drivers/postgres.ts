import postgres from "postgres";
import type { DatabaseDriver } from "./types.js";
import { registerDriver } from "./registry.js";

// ── PostgreSQL Driver ────────────────────────────────────────────────
//
// Uses the `postgres` (postgres.js) library for a lightweight,
// high-performance connection. Compatible with Drizzle ORM via
// drizzle-orm/postgres-js.
//

let client: postgres.Sql | null = null;

const postgresDriver: DatabaseDriver = {
  name: "postgres",

  async connect(connectionString: string): Promise<postgres.Sql> {
    client = postgres(connectionString);
    // Verify connectivity
    await client`SELECT 1`;
    console.log("[db] Connected to PostgreSQL");
    return client;
  },

  async disconnect(): Promise<void> {
    if (client) {
      await client.end();
      client = null;
      console.log("[db] Disconnected from PostgreSQL");
    }
  },
};

// Self-register
registerDriver(postgresDriver);
