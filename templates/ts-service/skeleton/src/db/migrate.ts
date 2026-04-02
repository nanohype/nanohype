import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// ── Migration Runner ─────────────────────────────────────────────────
//
// Applies pending migrations from the drizzle/ directory.
//
// Usage:
//   npm run db:migrate
//

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main(): Promise<void> {
  console.log("[migrate] Running migrations...");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[migrate] Done");
  await client.end();
}

main().catch((err: unknown) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
