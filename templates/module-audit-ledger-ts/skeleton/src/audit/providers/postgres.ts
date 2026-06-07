import pg from "pg";
import type { Pool } from "pg";
import type { AuditAdapter } from "./types.js";
import type { AuditConfig, AuditEvent, QueryOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { eventIdOf } from "../event-id.js";

// ── Postgres Adapter ────────────────────────────────────────────────
//
// Immutable append-only ledger in a single table. Create it once:
//
//   CREATE TABLE audit_events (
//     event_id   text PRIMARY KEY,
//     context_id text NOT NULL,
//     event_type text NOT NULL,
//     actor      text NOT NULL,
//     details    jsonb NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX ON audit_events (context_id, created_at DESC);
//
// append INSERTs with ON CONFLICT DO NOTHING, so a retry of the same event id is
// idempotent. config: { connectionString?, pool?, table? } — pass an existing
// Pool to share the app's, or a connectionString to open one this adapter owns.
//

class PostgresAuditAdapter implements AuditAdapter {
  readonly name = "postgres";
  private pool!: Pool;
  private ownsPool = false;
  private table = "audit_events";

  async init(config: AuditConfig): Promise<void> {
    if (config.table) this.table = String(config.table);
    if (config.pool) {
      this.pool = config.pool as Pool;
    } else {
      this.pool = new pg.Pool({ connectionString: config.connectionString as string | undefined });
      this.ownsPool = true;
    }
  }

  async append(event: AuditEvent): Promise<void> {
    const eventId = eventIdOf(event);
    await this.pool.query(
      `INSERT INTO ${this.table} (event_id, context_id, event_type, actor, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, event.contextId, event.eventType, event.actor, event.details, event.timestamp],
    );
  }

  async queryByContext(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]> {
    const params: unknown[] = [contextId];
    let sql = `SELECT event_id, context_id, event_type, actor, details, created_at
               FROM ${this.table} WHERE context_id = $1`;
    if (opts?.since) {
      params.push(opts.since);
      sql += ` AND created_at >= $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC`;
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
      sql += ` LIMIT $${params.length}`;
    }
    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => ({
      contextId: r.context_id as string,
      eventType: r.event_type as string,
      actor: r.actor as string,
      details: r.details as Record<string, unknown>,
      timestamp: new Date(r.created_at as string).toISOString(),
      eventId: r.event_id as string,
    }));
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}

registerProvider("postgres", () => new PostgresAuditAdapter());
