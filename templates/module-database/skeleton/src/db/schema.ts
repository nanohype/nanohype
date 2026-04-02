import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Example Schema ──────────────────────────────────────────────────
//
// Drizzle ORM schema definition. This file defines your database
// tables using Drizzle's type-safe column builders. For SQLite or
// Turso, swap the imports to drizzle-orm/sqlite-core and use
// sqliteTable instead of pgTable.
//
// Run `npm run db:generate` to create migration files from schema
// changes, then `npm run db:migrate` to apply them.
//
// See: https://orm.drizzle.team/docs/sql-schema-declaration
//

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
