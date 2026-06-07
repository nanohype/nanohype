import type { AuditAdapter } from "./types.js";
import type { AuditEvent, QueryOptions } from "../types.js";
import { registerProvider } from "./registry.js";
import { eventIdOf } from "../event-id.js";

// ── Memory Adapter ──────────────────────────────────────────────────
//
// In-process, append-only ledger for development and tests. Not durable —
// events are lost on restart. Idempotent on the event id like the durable
// backends, so tests exercise the same semantics.
//

class MemoryAuditAdapter implements AuditAdapter {
  readonly name = "memory";
  private events: AuditEvent[] = [];
  private seen = new Set<string>();

  async init(): Promise<void> {}

  async append(event: AuditEvent): Promise<void> {
    const eventId = eventIdOf(event);
    if (this.seen.has(eventId)) return; // idempotent
    this.seen.add(eventId);
    this.events.push({ ...event, eventId });
  }

  async queryByContext(contextId: string, opts?: QueryOptions): Promise<AuditEvent[]> {
    let out = this.events.filter((e) => e.contextId === contextId);
    if (opts?.since) out = out.filter((e) => e.timestamp >= opts.since!);
    out = [...out].sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest-first
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit);
    return out;
  }

  async close(): Promise<void> {
    this.events = [];
    this.seen.clear();
  }
}

registerProvider("memory", () => new MemoryAuditAdapter());
