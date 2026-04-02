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

    // Verify connectivity with a test query
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } catch (err) {
      client.release();
      await pool.end();
      pool = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`PostgreSQL connection test failed: ${message}`);
    }
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
