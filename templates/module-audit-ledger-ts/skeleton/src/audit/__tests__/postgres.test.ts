import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventIdOf } from "../event-id.js";
import { getProvider } from "../providers/index.js";
import type { AuditEvent } from "../types.js";

// Records what the adapter builds its own pool with. Only pg is faked — the
// adapter, the registry and the id derivation all run as they ship. Without
// this the owned-pool case can assert nothing but that a promise resolves, and
// the connection string the adapter opened on is unobservable.
const poolOptions: Record<string, unknown>[] = [];
const end = vi.fn();

vi.mock("pg", () => {
  class Pool {
    constructor(options: Record<string, unknown>) {
      poolOptions.push(options);
    }
    end = end;
    query = vi.fn(async () => ({ rows: [] }));
  }
  return { default: { Pool }, Pool };
});

const event: AuditEvent = {
  contextId: "incident-1",
  eventType: "APPROVED",
  actor: "u-1",
  details: { draftId: "d-1" },
  timestamp: "2026-01-01T00:00:00.000Z",
};

type Call = { sql: string; params: unknown[] };

/** Stands in for the pg Pool the adapter takes as config.pool. */
function fakePool(rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows };
    }),
    end: vi.fn(async () => {}),
  };
}

describe("postgres adapter init", () => {
  beforeEach(() => {
    poolOptions.length = 0;
    end.mockClear();
  });

  it("opens its own pool on the connection string the config names", async () => {
    const adapter = getProvider("postgres");
    await adapter.init({ connectionString: "postgres://ledger@db:5432/audit" });

    expect(poolOptions).toEqual([{ connectionString: "postgres://ledger@db:5432/audit" }]);
    await adapter.close();
    // It opened the pool, so it ends it.
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("leaves an injected pool to its owner", async () => {
    const pool = fakePool();
    const adapter = getProvider("postgres");
    await adapter.init({ pool });
    await adapter.close();

    expect(poolOptions).toEqual([]);
    expect(pool.end).not.toHaveBeenCalled();
  });
});

describe("postgres adapter append", () => {
  it("inserts the event and lets a retry of the same id collapse", async () => {
    const pool = fakePool();
    const adapter = getProvider("postgres");
    await adapter.init({ pool });
    await adapter.append(event);

    expect(pool.calls[0].sql).toContain("INSERT INTO audit_events");
    expect(pool.calls[0].sql).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(pool.calls[0].params).toEqual([
      eventIdOf(event),
      "incident-1",
      "APPROVED",
      "u-1",
      { draftId: "d-1" },
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("writes to the configured table", async () => {
    const pool = fakePool();
    const adapter = getProvider("postgres");
    await adapter.init({ pool, table: "compliance_events" });
    await adapter.append(event);
    expect(pool.calls[0].sql).toContain("INSERT INTO compliance_events");
  });
});

describe("postgres adapter queryByContext", () => {
  it("reads a context newest-first and maps the row back to an event", async () => {
    const pool = fakePool([
      {
        event_id: "e-1",
        context_id: "incident-1",
        event_type: "APPROVED",
        actor: "u-1",
        details: { draftId: "d-1" },
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const adapter = getProvider("postgres");
    await adapter.init({ pool });
    const events = await adapter.queryByContext("incident-1");

    expect(pool.calls[0].sql).toContain("ORDER BY created_at DESC");
    expect(pool.calls[0].sql).not.toContain("LIMIT");
    expect(pool.calls[0].params).toEqual(["incident-1"]);
    expect(events).toEqual([
      {
        contextId: "incident-1",
        eventType: "APPROVED",
        actor: "u-1",
        details: { draftId: "d-1" },
        timestamp: "2026-01-01T00:00:00.000Z",
        eventId: "e-1",
      },
    ]);
  });

  it("binds since and limit as parameters in the order they are appended", async () => {
    const pool = fakePool();
    const adapter = getProvider("postgres");
    await adapter.init({ pool });
    await adapter.queryByContext("incident-1", { since: "2026-01-01T00:00:00.000Z", limit: 5 });

    expect(pool.calls[0].sql).toContain("AND created_at >= $2");
    expect(pool.calls[0].sql).toContain("LIMIT $3");
    expect(pool.calls[0].params).toEqual(["incident-1", "2026-01-01T00:00:00.000Z", 5]);
  });
});
