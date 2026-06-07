import { describe, it, expect } from "vitest";
import { deriveEventId, eventIdOf } from "../event-id.js";
import type { AuditEvent } from "../types.js";

const base: AuditEvent = {
  contextId: "incident-1",
  eventType: "APPROVED",
  actor: "u-1",
  details: { draftId: "d-1" },
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("deriveEventId", () => {
  it("is deterministic for the same event content", () => {
    expect(deriveEventId(base)).toBe(deriveEventId({ ...base }));
  });

  it("changes when any identifying field changes", () => {
    expect(deriveEventId(base)).not.toBe(deriveEventId({ ...base, timestamp: "2026-01-02T00:00:00.000Z" }));
    expect(deriveEventId(base)).not.toBe(deriveEventId({ ...base, details: { draftId: "d-2" } }));
    expect(deriveEventId(base)).not.toBe(deriveEventId({ ...base, actor: "u-2" }));
  });
});

describe("eventIdOf", () => {
  it("uses an explicit eventId when present", () => {
    expect(eventIdOf({ ...base, eventId: "explicit" })).toBe("explicit");
  });

  it("derives one when absent", () => {
    expect(eventIdOf(base)).toBe(deriveEventId(base));
  });
});
