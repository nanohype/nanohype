// ── Deterministic event id ──────────────────────────────────────────
//
// Pure + dependency-free (only node:crypto) so it's unit-testable in isolation.
// When an AuditEvent carries no eventId, the ledger derives a stable one from
// the event's content, so retrying the same append is idempotent on backends
// that condition on the id (Postgres ON CONFLICT, DynamoDB attribute_not_exists,
// SQS MessageDeduplicationId).

import { createHash } from "node:crypto";
import type { AuditEvent } from "./types.js";

/**
 * A content-addressed id for an event: sha256 over the identifying fields. Two
 * appends with the same context/type/actor/timestamp/details collapse to one;
 * a genuinely new event (different timestamp or details) gets a new id.
 */
export function deriveEventId(event: AuditEvent): string {
  const canonical = JSON.stringify([
    event.contextId,
    event.eventType,
    event.actor,
    event.timestamp,
    event.details,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** The event's id, deriving a deterministic one if it doesn't carry its own. */
export function eventIdOf(event: AuditEvent): string {
  return event.eventId ?? deriveEventId(event);
}
