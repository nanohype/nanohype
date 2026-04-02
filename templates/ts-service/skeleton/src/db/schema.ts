import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Example Schema ───────────────────────────────────────────────────
//
// Drizzle ORM schema definition. This file defines your database
// tables. Run `npm run db:generate` to create migration files from
// schema changes, then `npm run db:migrate` to apply them.
//
// See: https://orm.drizzle.team/docs/sql-schema-declaration
//

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
