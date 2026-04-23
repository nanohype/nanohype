import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { DatabaseDriver } from "./types.js";
import { registerDriver } from "./registry.js";

// ── SQLite Driver ───────────────────────────────────────────────────
//
// Uses `better-sqlite3` for a synchronous, high-performance SQLite
// interface. Enables WAL mode by default for better concurrent read
// performance. Compatible with Drizzle ORM via
// drizzle-orm/better-sqlite3.
//

let db: Database.Database | null = null;

const sqliteDriver: DatabaseDriver = {
  name: "sqlite",

  async connect(url: string): Promise<unknown> {
    // Strip sqlite:// or file: prefix if present
    const path = url
      .replace(/^sqlite:\/\//, "")
      .replace(/^file:/, "");

    db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Verify connectivity with a test query
    try {
      db.prepare("SELECT 1").get();
    } catch (err) {
      db.close();
      db = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`SQLite connection test failed: ${message}`);
    }
    console.log(`[db] Connected to SQLite at ${path}`);

    return drizzle(db);
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
