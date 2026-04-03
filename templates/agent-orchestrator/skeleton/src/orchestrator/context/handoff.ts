// ── Handoff Protocol ────────────────────────────────────────────────
//
// Records agent-to-agent transitions with metadata, creating an
// audit trail of how context flows between agents during
// orchestration. Each handoff captures who handed off to whom,
// why, and what data was passed.
//
// Factory function returns a fresh protocol instance — no module-level
// mutable state.
//

/** A single handoff record in the audit trail. */
export interface HandoffRecord {
  /** The agent that produced the output. */
  fromAgent: string;

  /** The agent that will consume the output. */
  toAgent: string;

  /** Human-readable reason for the handoff. */
  reason: string;

  /** The subtask ID that triggered this handoff. */
  subtaskId: string;

  /** ISO-8601 timestamp of when the handoff occurred. */
  timestamp: string;

  /** Optional metadata passed with the handoff. */
  metadata?: Record<string, unknown>;
}

export interface HandoffProtocol {
  /** Record a handoff between two agents. */
  record(handoff: Omit<HandoffRecord, "timestamp">): void;

  /** Get all handoff records in order. */
  getAll(): HandoffRecord[];

  /** Get handoffs where the given agent was the sender. */
  getFrom(agentName: string): HandoffRecord[];

  /** Get handoffs where the given agent was the receiver. */
  getTo(agentName: string): HandoffRecord[];

  /** Get the number of recorded handoffs. */
  count(): number;

  /** Clear all handoff records. */
  clear(): void;
}

/**
 * Create a new handoff protocol instance.
 * Each call returns an independent protocol with its own record store.
 */
export function createHandoffProtocol(): HandoffProtocol {
  const records: HandoffRecord[] = [];

  return {
    record(handoff: Omit<HandoffRecord, "timestamp">): void {
      records.push({
        ...handoff,
        timestamp: new Date().toISOString(),
      });
    },

    getAll(): HandoffRecord[] {
      return [...records];
    },

    getFrom(agentName: string): HandoffRecord[] {
      return records.filter((r) => r.fromAgent === agentName);
    },

    getTo(agentName: string): HandoffRecord[] {
      return records.filter((r) => r.toAgent === agentName);
    },

    count(): number {
      return records.length;
    },

    clear(): void {
      records.length = 0;
    },
  };
}
