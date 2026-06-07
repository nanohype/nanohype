import { describe, it, expect } from "vitest";
import { createAuditLedger } from "../index.js";

describe("createAuditLedger (memory)", () => {
  it("appends and reads back a context's trail newest-first", async () => {
    const audit = await createAuditLedger("memory");
    await audit.append({
      contextId: "run-1",
      eventType: "DRAFT_GENERATED",
      actor: "system",
      details: {},
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    await audit.append({
      contextId: "run-1",
      eventType: "APPROVED",
      actor: "u-1",
      details: {},
      timestamp: "2026-01-01T01:00:00.000Z",
    });
    await audit.append({
      contextId: "run-2",
      eventType: "APPROVED",
      actor: "u-2",
      details: {},
      timestamp: "2026-01-01T02:00:00.000Z",
    });

    const trail = await audit.query("run-1");
    expect(trail).toHaveLength(2);
    expect(trail[0].eventType).toBe("APPROVED"); // newest first
    expect(trail[1].eventType).toBe("DRAFT_GENERATED");
    await audit.close();
  });

  it("is idempotent on the derived event id", async () => {
    const audit = await createAuditLedger("memory");
    const event = {
      contextId: "run-1",
      eventType: "SENT",
      actor: "system",
      details: { messageId: "m-1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    await audit.append(event);
    await audit.append(event); // same content → same id → collapsed
    expect(await audit.query("run-1")).toHaveLength(1);
    await audit.close();
  });

  it("honors since and limit", async () => {
    const audit = await createAuditLedger("memory");
    for (let h = 0; h < 4; h++) {
      await audit.append({
        contextId: "run-1",
        eventType: "TICK",
        actor: "system",
        details: { h },
        timestamp: `2026-01-01T0${h}:00:00.000Z`,
      });
    }
    expect(await audit.query("run-1", { since: "2026-01-01T02:00:00.000Z" })).toHaveLength(2);
    expect(await audit.query("run-1", { limit: 1 })).toHaveLength(1);
    await audit.close();
  });

  it("defaults the timestamp when omitted", async () => {
    const audit = await createAuditLedger("memory");
    await audit.append({ contextId: "run-1", eventType: "PING", actor: "system", details: {} });
    const [e] = await audit.query("run-1");
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await audit.close();
  });
});
