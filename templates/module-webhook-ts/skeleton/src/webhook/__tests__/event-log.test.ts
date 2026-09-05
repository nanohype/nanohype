import { describe, expect, it } from "vitest";
import { InMemoryEventLog } from "../event-log.js";
import type { WebhookEvent } from "../types.js";

// ── In-memory event log ────────────────────────────────────────────
//
// The log is what a consumer reads back when asking why a delivery
// failed, so the filters and the ordering are the behaviour: an entry
// that is stored but unreachable through `get` or `list` is not recorded.

const event = (id: string): WebhookEvent => ({
  id,
  event: "push",
  payload: { ref: "main" },
  timestamp: "2024-01-01T00:00:00.000Z",
});

function populated(): InMemoryEventLog {
  const log = new InMemoryEventLog();
  log.record({ event: event("in-ok"), direction: "received", status: "success", attempts: 1 });
  log.record({
    event: event("in-fail"),
    direction: "received",
    status: "failed",
    attempts: 1,
    error: "Invalid signature",
  });
  log.record({ event: event("out-ok"), direction: "sent", status: "success", attempts: 2 });
  return log;
}

describe("in-memory event log", () => {
  it("stamps each entry with the time it was logged", () => {
    const log = new InMemoryEventLog();

    log.record({ event: event("evt-1"), direction: "received", status: "success", attempts: 1 });

    expect(log.get("evt-1")).toMatchObject({
      direction: "received",
      status: "success",
      attempts: 1,
    });
    expect(log.get("evt-1")?.loggedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns undefined for an event id it never recorded", () => {
    expect(new InMemoryEventLog().get("absent")).toBeUndefined();
  });

  it("lists every entry most recent first", () => {
    expect(
      populated()
        .list()
        .map((e) => e.event.id),
    ).toEqual(["out-ok", "in-fail", "in-ok"]);
  });

  it("filters by direction", () => {
    expect(
      populated()
        .list({ direction: "sent" })
        .map((e) => e.event.id),
    ).toEqual(["out-ok"]);
  });

  it("filters by status", () => {
    expect(
      populated()
        .list({ status: "failed" })
        .map((e) => e.event.id),
    ).toEqual(["in-fail"]);
  });

  it("applies direction and status together", () => {
    const entries = populated().list({ direction: "received", status: "success" });

    expect(entries.map((e) => e.event.id)).toEqual(["in-ok"]);
  });

  it("takes the limit from the most recent end", () => {
    expect(
      populated()
        .list({ limit: 2 })
        .map((e) => e.event.id),
    ).toEqual(["out-ok", "in-fail"]);
  });

  it("hands back a copy, so mutating the result leaves the log intact", () => {
    const log = populated();

    log.list().pop();

    expect(log.list()).toHaveLength(3);
  });

  it("empties on clear", () => {
    const log = populated();

    log.clear();

    expect(log.list()).toEqual([]);
    expect(log.get("in-ok")).toBeUndefined();
  });
});
