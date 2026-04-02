import Database from "better-sqlite3";
import type { DatabaseDriver } from "./types.js";
import { registerDriver } from "./registry.js";

// ── SQLite Driver ────────────────────────────────────────────────────
//
// Uses `better-sqlite3` for a synchronous, zero-dependency SQLite
// interface. Compatible with Drizzle ORM via drizzle-orm/better-sqlite3.
//

let db: Database.Database | null = null;

const sqliteDriver: DatabaseDriver = {
  name: "sqlite",

  async connect(connectionString: string): Promise<Database.Database> {
    // Strip sqlite:// prefix if present
    const path = connectionString.replace(/^sqlite:\/\//, "");
    db = new Database(path);
    db.pragma("journal_mode = WAL");
    console.log(`[db] Connected to SQLite at ${path}`);
    return db;
  },

  async disconnect(): Promise<void> {
    if (db) {
      db.close();
      db = null;
      console.log("[db] Disconnected from SQLite");
    }
  },
};

// Self-register
registerDriver(sqliteDriver);
