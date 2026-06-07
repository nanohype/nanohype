// ── Audit Ledger Core Types ─────────────────────────────────────────
//
// Shared shapes for audit events and adapter configuration. These are
// backend-agnostic — every storage adapter works against the same event.
//

/**
 * A single audit record. `contextId` is the partition the event belongs to —
 * the app's domain key (an incident id, a pipeline run id, a user id). The
 * meaning of an event lives in `eventType` + `details`; this module never
 * interprets them, it only persists and reads them back.
 */
export interface AuditEvent {
  /** Domain partition key (incident id / run id / user id). */
  contextId: string;
  /** Event discriminator, e.g. "APPROVED", "HUMAN_EDIT", "query". */
  eventType: string;
  /** Who/what caused the event (user id, "system", a service name). */
  actor: string;
  /** Event-specific payload. Scrub secrets/PII before passing it in. */
  details: Record<string, unknown>;
  /** ISO-8601 timestamp. Defaulted to now() by the ledger if omitted. */
  timestamp: string;
  /**
   * Idempotency key. Adapters that support conditional writes use it to make
   * append exactly-once; if omitted the ledger derives a deterministic id from
   * the event content (see event-id.ts).
   */
  eventId?: string;
}

/** Provider-specific connection/configuration. */
export interface AuditConfig {
  [key: string]: unknown;
}

/** Options for reading a context's events. */
export interface QueryOptions {
  /** Only events at or after this ISO-8601 timestamp. */
  since?: string;
  /** Strongly-consistent read (DynamoDB) — required when a read gates a write. */
  consistentRead?: boolean;
  /** Cap the number of events returned. */
  limit?: number;
}
