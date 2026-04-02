import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Database Schema ─────────────────────────────────────────────────
//
// Drizzle ORM schema definition. Define your database tables here.
// Run `npm run db:generate` to create migration files from schema
// changes, then `npm run db:migrate` to apply them.
//
// See: https://orm.drizzle.team/docs/sql-schema-declaration
//

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
