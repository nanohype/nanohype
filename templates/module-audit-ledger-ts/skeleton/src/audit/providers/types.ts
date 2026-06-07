// ── Audit Adapter Interface ─────────────────────────────────────────
//
// Every storage backend implements this. The registry pattern lets new
// adapters self-register at import time; consumers call getProvider().
//

import type { AuditConfig, AuditEvent, QueryOptions } from "../types.js";

export interface AuditAdapter {
  /** Unique adapter name (e.g. "memory", "postgres", "dynamodb", "sqs"). */
  readonly name: string;

  /** Initialize with configuration (open the pool/client). */
  init(config: AuditConfig): Promise<void>;

  /**
   * Append one event. Append-only — never updates or deletes. Idempotent on the
   * event's id where the backend supports a conditional write.
   */
  append(event: AuditEvent): Promise<void>;

  /**
   * Read a context's events, newest-first. Throws on write-only backends (e.g.
   * the SQS adapter, whose events are drained to a queryable store by a
   * consumer) — those are queried on the drained store, not here.
   */
  queryByContext(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]>;

  /** Release connections. */
  close(): Promise<void>;
}
