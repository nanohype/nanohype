import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";
import type { AnalyticsProvider } from "../providers/types.js";
import type { MockEvent } from "../providers/mock.js";

// ── Mock Provider Tests ──────────────────────────────────────────
//
// Validates track, identify, group, page, flush, and event
// accumulation for the in-memory mock analytics provider.
//

describe("mock analytics provider", () => {
  let provider: AnalyticsProvider & { events: MockEvent[] };

  beforeEach(async () => {
    provider = getProvider("mock") as AnalyticsProvider & { events: MockEvent[] };
    await provider.close();
    await provider.init({});
  });

  it("creates independent instances (factory pattern)", () => {
    const a = getProvider("mock") as AnalyticsProvider & { events: MockEvent[] };
    const b = getProvider("mock") as AnalyticsProvider & { events: MockEvent[] };
    expect(a).not.toBe(b);
    expect(a.events).not.toBe(b.events);
  });

  describe("track", () => {
    it("records a track event", async () => {
      await provider.track({
        event: "button_clicked",
        userId: "user-1",
        properties: { button: "submit" },
      });

      expect(provider.events).toHaveLength(1);
      expect(provider.events[0].type).toBe("track");
      expect(provider.events[0].payload.event).toBe("button_clicked");
      expect(provider.events[0].payload.userId).toBe("user-1");
    });

    it("accumulates multiple events", async () => {
      await provider.track({ event: "a", userId: "1" });
      await provider.track({ event: "b", userId: "2" });
      await provider.track({ event: "c", userId: "3" });

      expect(provider.events).toHaveLength(3);
    });

    it("records event properties", async () => {
      await provider.track({
        event: "purchase",
        userId: "user-1",
        properties: { amount: 99.99, currency: "USD" },
      });

      const props = provider.events[0].payload.properties as Record<string, unknown>;
      expect(props.amount).toBe(99.99);
      expect(props.currency).toBe("USD");
    });
  });

  describe("identify", () => {
    it("records an identify event", async () => {
      await provider.identify({
        userId: "user-1",
        traits: { name: "Alice", email: "alice@example.com" },
      });

      expect(provider.events).toHaveLength(1);
      expect(provider.events[0].type).toBe("identify");
      expect(provider.events[0].payload.userId).toBe("user-1");
      expect((provider.events[0].payload.traits as Record<string, unknown>).name).toBe("Alice");
    });
  });

  describe("group", () => {
    it("records a group event", async () => {
      await provider.group({
        userId: "user-1",
        groupId: "company-1",
        traits: { name: "Acme Inc" },
      });

      expect(provider.events).toHaveLength(1);
      expect(provider.events[0].type).toBe("group");
      expect(provider.events[0].payload.groupId).toBe("company-1");
    });
  });

  describe("page", () => {
    it("records a page view event", async () => {
      await provider.page({
        userId: "user-1",
        name: "Home",
        category: "Marketing",
        properties: { url: "/", referrer: "https://google.com" },
      });

      expect(provider.events).toHaveLength(1);
      expect(provider.events[0].type).toBe("page");
      expect(provider.events[0].payload.name).toBe("Home");
    });
  });

  describe("flush", () => {
    it("is a no-op (events are synchronous)", async () => {
      await provider.track({ event: "test" });
      await provider.flush();

      // Events are still there after flush (mock stores synchronously)
      expect(provider.events).toHaveLength(1);
    });
  });

  describe("close", () => {
    it("clears all events", async () => {
      await provider.track({ event: "a" });
      await provider.track({ event: "b" });

      expect(provider.events).toHaveLength(2);

      await provider.close();

      expect(provider.events).toHaveLength(0);
    });
  });

  it("records timestamps", async () => {
    const timestamp = "2025-01-01T00:00:00.000Z";
    await provider.track({ event: "test", timestamp });

    expect(provider.events[0].timestamp).toBe(timestamp);
  });
});
