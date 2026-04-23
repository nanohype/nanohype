import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { DatabaseDriver } from "./types.js";
import { registerDriver } from "./registry.js";

// ── Turso / libSQL Driver ───────────────────────────────────────────
//
// Uses `@libsql/client` for connecting to Turso's edge-hosted SQLite
// databases or local SQLite files via the libSQL protocol. Supports:
//
//   - Remote Turso URLs (libsql://... or https://...)
//   - Local SQLite files (file:local.db)
//   - Embedded replicas (set TURSO_SYNC_URL for local + remote sync)
//
// Compatible with Drizzle ORM via drizzle-orm/libsql.
//

let client: ReturnType<typeof createClient> | null = null;

const tursoDriver: DatabaseDriver = {
  name: "turso",

  async connect(url: string, options?: Record<string, unknown>): Promise<unknown> {
    const authToken = (options?.authToken as string) ?? process.env.TURSO_AUTH_TOKEN;
    const syncUrl = (options?.syncUrl as string) ?? process.env.TURSO_SYNC_URL;

    client = createClient({
      url,
      authToken,
      ...(syncUrl ? { syncUrl } : {}),
    });

    // Verify connectivity
    await client.execute("SELECT 1");
    console.log(`[db] Connected to Turso at ${url}`);

    return drizzle(client);
  },

  async disconnect(): Promise<void> {
    if (client) {
      client.close();
      client = null;
      console.log("[db] Disconnected from Turso");
    }
  },
};

// Self-register
registerDriver(tursoDriver);
