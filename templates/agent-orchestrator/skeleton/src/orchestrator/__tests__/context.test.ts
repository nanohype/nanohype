import { describe, it, expect } from "vitest";
import { createSharedContext } from "../context/shared.js";
import { createHandoffProtocol } from "../context/handoff.js";

describe("shared context", () => {
  it("stores and retrieves global values", () => {
    const ctx = createSharedContext();
    ctx.set("key", "value");
    expect(ctx.get("key")).toBe("value");
  });

  it("returns undefined for missing keys", () => {
    const ctx = createSharedContext();
    expect(ctx.get("missing")).toBeUndefined();
  });

  it("supports namespaced storage", () => {
    const ctx = createSharedContext();
    ctx.setNamespaced("agent-a", "key", "from-a");
    ctx.setNamespaced("agent-b", "key", "from-b");

    expect(ctx.getNamespaced("agent-a", "key")).toBe("from-a");
    expect(ctx.getNamespaced("agent-b", "key")).toBe("from-b");
  });

  it("isolates namespaces from each other", () => {
    const ctx = createSharedContext();
    ctx.setNamespaced("agent-a", "secret", "hidden");

    expect(ctx.getNamespaced("agent-b", "secret")).toBeUndefined();
  });

  it("lists all namespaces", () => {
    const ctx = createSharedContext();
    ctx.setNamespaced("alpha", "k", 1);
    ctx.setNamespaced("beta", "k", 2);

    const ns = ctx.listNamespaces();
    expect(ns).toContain("alpha");
    expect(ns).toContain("beta");
  });

  it("clears all data", () => {
    const ctx = createSharedContext();
    ctx.set("global", "value");
    ctx.setNamespaced("ns", "key", "value");

    ctx.clear();

    expect(ctx.get("global")).toBeUndefined();
    expect(ctx.getNamespaced("ns", "key")).toBeUndefined();
    expect(ctx.listNamespaces()).toHaveLength(0);
  });

  it("returns all global key-value pairs", () => {
    const ctx = createSharedContext();
    ctx.set("a", 1);
    ctx.set("b", 2);

    const all = ctx.getAll();
    expect(all).toEqual({ a: 1, b: 2 });
  });

  describe("scoped context", () => {
    it("reads from global namespace", () => {
      const ctx = createSharedContext();
      ctx.set("shared-data", "hello");

      const scoped = ctx.scopedFor("agent-a");
      expect(scoped.get("shared-data")).toBe("hello");
    });

    it("writes to both agent namespace and global", () => {
      const ctx = createSharedContext();
      const scoped = ctx.scopedFor("agent-a");

      scoped.set("result", "from-a");

      // Visible in global
      expect(ctx.get("result")).toBe("from-a");
      // Visible in agent namespace
      expect(ctx.getNamespaced("agent-a", "result")).toBe("from-a");
    });

    it("agent namespace takes priority over global on read", () => {
      const ctx = createSharedContext();
      ctx.set("key", "global-value");
      ctx.setNamespaced("agent-a", "key", "agent-value");

      const scoped = ctx.scopedFor("agent-a");
      expect(scoped.get("key")).toBe("agent-value");
    });

    it("getAll merges global and agent namespace", () => {
      const ctx = createSharedContext();
      ctx.set("global-key", "global");
      ctx.setNamespaced("agent-a", "agent-key", "agent");

      const scoped = ctx.scopedFor("agent-a");
      const all = scoped.getAll();

      expect(all["global-key"]).toBe("global");
      expect(all["agent-key"]).toBe("agent");
    });

    it("different agents have isolated scoped contexts", () => {
      const ctx = createSharedContext();
      const scopedA = ctx.scopedFor("agent-a");
      const scopedB = ctx.scopedFor("agent-b");

      scopedA.set("data", "from-a");

      // agent-b can see it via global (scoped.set writes to global too)
      expect(scopedB.get("data")).toBe("from-a");

      // But agent-b's namespace is separate
      expect(ctx.getNamespaced("agent-b", "data")).toBeUndefined();
    });
  });
});

describe("handoff protocol", () => {
  it("records handoffs with timestamps", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "planner",
      toAgent: "researcher",
      reason: "Research phase begins",
      subtaskId: "st-1",
    });

    const all = protocol.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].fromAgent).toBe("planner");
    expect(all[0].toAgent).toBe("researcher");
    expect(all[0].timestamp).toBeTruthy();
  });

  it("filters by sender", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "planner",
      toAgent: "researcher",
      reason: "r1",
      subtaskId: "st-1",
    });
    protocol.record({
      fromAgent: "researcher",
      toAgent: "coder",
      reason: "r2",
      subtaskId: "st-2",
    });

    const fromPlanner = protocol.getFrom("planner");
    expect(fromPlanner).toHaveLength(1);
    expect(fromPlanner[0].toAgent).toBe("researcher");
  });

  it("filters by receiver", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "planner",
      toAgent: "researcher",
      reason: "r1",
      subtaskId: "st-1",
    });
    protocol.record({
      fromAgent: "planner",
      toAgent: "coder",
      reason: "r2",
      subtaskId: "st-2",
    });

    const toResearcher = protocol.getTo("researcher");
    expect(toResearcher).toHaveLength(1);
  });

  it("reports count", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "a",
      toAgent: "b",
      reason: "r",
      subtaskId: "s",
    });
    protocol.record({
      fromAgent: "b",
      toAgent: "c",
      reason: "r",
      subtaskId: "s",
    });

    expect(protocol.count()).toBe(2);
  });

  it("clears all records", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "a",
      toAgent: "b",
      reason: "r",
      subtaskId: "s",
    });

    protocol.clear();

    expect(protocol.count()).toBe(0);
    expect(protocol.getAll()).toHaveLength(0);
  });

  it("supports metadata", () => {
    const protocol = createHandoffProtocol();

    protocol.record({
      fromAgent: "planner",
      toAgent: "researcher",
      reason: "Research needed",
      subtaskId: "st-1",
      metadata: { priority: "high", context: "initial" },
    });

    const all = protocol.getAll();
    expect(all[0].metadata).toEqual({ priority: "high", context: "initial" });
  });
});
