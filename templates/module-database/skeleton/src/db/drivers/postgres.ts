import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabaseDriver } from "./types.js";
import { registerDriver } from "./registry.js";

// ── PostgreSQL Driver ───────────────────────────────────────────────
//
// Uses `pg` (node-postgres) with a connection pool for concurrent
// query handling. Compatible with Drizzle ORM via
// drizzle-orm/node-postgres.
//

let pool: pg.Pool | null = null;

const postgresDriver: DatabaseDriver = {
  name: "postgres",

  async connect(url: string, options?: Record<string, unknown>): Promise<unknown> {
    const poolSize = (options?.poolSize as number) ?? 10;

    pool = new pg.Pool({
      connectionString: url,
      max: poolSize,
    });

    // Verify connectivity
    const client = await pool.connect();
    client.release();
    console.log("[db] Connected to PostgreSQL");

    return drizzle(pool);
  },

  async disconnect(): Promise<void> {
    if (pool) {
      await pool.end();
      pool = null;
      console.log("[db] Disconnected from PostgreSQL");
    }
  },
};

// Self-register
registerDriver(postgresDriver);
