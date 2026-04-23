import type { AnalyticsProvider } from "./types.js";
import type {
  TrackEvent,
  IdentifyPayload,
  GroupPayload,
  PagePayload,
  AnalyticsConfig,
} from "../types.js";
import { registerProvider } from "./registry.js";

// ── Mock Provider ─────────────────────────────────────────────────
//
// In-memory analytics provider for testing. Stores all events in
// an instance-scoped array that can be inspected in test assertions.
// No external dependencies or API keys required.
//
// Each factory call returns an independent instance with its own
// events array -- no shared mutable state.
//

/** Event record stored by the mock provider. */
export interface MockEvent {
  type: "track" | "identify" | "group" | "page";
  payload: Record<string, unknown>;
  timestamp: string;
}

function createMockProvider(): AnalyticsProvider & { events: MockEvent[] } {
  const events: MockEvent[] = [];

  return {
    name: "mock",
    events,

    async init(_config: AnalyticsConfig): Promise<void> {
      // No setup needed for in-memory provider
    },

    async track(event: TrackEvent): Promise<void> {
      events.push({
        type: "track",
        payload: {
          event: event.event,
          userId: event.userId,
          anonymousId: event.anonymousId,
          properties: event.properties,
        },
        timestamp: event.timestamp ?? new Date().toISOString(),
      });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      events.push({
        type: "identify",
        payload: {
          userId: payload.userId,
          traits: payload.traits,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async group(payload: GroupPayload): Promise<void> {
      events.push({
        type: "group",
        payload: {
          userId: payload.userId,
          groupId: payload.groupId,
          traits: payload.traits,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async page(payload: PagePayload): Promise<void> {
      events.push({
        type: "page",
        payload: {
          userId: payload.userId,
          anonymousId: payload.anonymousId,
          name: payload.name,
          category: payload.category,
          properties: payload.properties,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async flush(): Promise<void> {
      // No-op — events are stored synchronously
    },

    async close(): Promise<void> {
      events.length = 0;
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
