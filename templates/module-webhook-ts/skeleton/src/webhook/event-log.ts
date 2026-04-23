// ── Webhook Event Log ──────────────────────────────────────────────
//
// Records all received and sent webhook events for debugging and
// auditing. The interface is storage-agnostic — the in-memory
// implementation is included for development and testing.
//

import type { EventId, WebhookEvent } from "./types.js";

/** Direction of the webhook event. */
export type EventDirection = "received" | "sent";

/** Status of a logged event. */
export type EventStatus = "success" | "failed" | "pending";

/** A single entry in the event log. */
export interface EventLogEntry {
  /** The webhook event. */
  event: WebhookEvent;

  /** Whether this was a received or sent event. */
  direction: EventDirection;

  /** Current status of the event. */
  status: EventStatus;

  /** Number of delivery attempts (for sent events). */
  attempts: number;

  /** ISO-8601 timestamp of when this entry was logged. */
  loggedAt: string;

  /** Error message if the event failed. */
  error?: string;
}

/** Options for listing log entries. */
export interface ListOptions {
  /** Maximum number of entries to return. */
  limit?: number;

  /** Filter by direction. */
  direction?: EventDirection;

  /** Filter by status. */
  status?: EventStatus;
}

/** Interface for webhook event logging. */
export interface WebhookEventLog {
  /** Record a webhook event. */
  record(entry: Omit<EventLogEntry, "loggedAt">): void;

  /** Retrieve a log entry by event ID. */
  get(eventId: EventId): EventLogEntry | undefined;

  /** List log entries with optional filters. */
  list(opts?: ListOptions): EventLogEntry[];

  /** Clear all log entries. */
  clear(): void;
}

// ── In-Memory Implementation ───────────────────────────────────────

/**
 * Simple in-memory event log backed by an array. Suitable for
 * development and testing. Entries are lost on process exit.
 */
export class InMemoryEventLog implements WebhookEventLog {
  private entries: EventLogEntry[] = [];

  record(entry: Omit<EventLogEntry, "loggedAt">): void {
    this.entries.push({
      ...entry,
      loggedAt: new Date().toISOString(),
    });
  }

  get(eventId: EventId): EventLogEntry | undefined {
    return this.entries.find((e) => e.event.id === eventId);
  }

  list(opts?: ListOptions): EventLogEntry[] {
    let result = [...this.entries];

    if (opts?.direction) {
      result = result.filter((e) => e.direction === opts.direction);
    }

    if (opts?.status) {
      result = result.filter((e) => e.status === opts.status);
    }

    // Most recent first
    result.reverse();

    if (opts?.limit) {
      result = result.slice(0, opts.limit);
    }

    return result;
  }

  clear(): void {
    this.entries = [];
  }
}
