import type { AnalyticsProvider } from "./types.js";
import type {
  TrackEvent,
  IdentifyPayload,
  GroupPayload,
  PagePayload,
  AnalyticsConfig,
} from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { createEventBuffer } from "../buffer/event-buffer.js";
import { logger } from "../logger.js";

// ── Mixpanel Provider ─────────────────────────────────────────────
//
// Mixpanel API via native fetch. Uses track and engage endpoints
// for events and user profiles. Buffers events locally and sends
// them in batches. Each factory call returns a new instance.
//
// Auth: MIXPANEL_TOKEN environment variable.
//

const MIXPANEL_API = "https://api.mixpanel.com";

function createMixpanelProvider(): AnalyticsProvider {
  let token = "";
  const cb = createCircuitBreaker();
  let buffer: ReturnType<typeof createEventBuffer> | undefined;

  function requireBuffer(): ReturnType<typeof createEventBuffer> {
    if (!buffer) throw new Error("Provider not initialized — call init() first");
    return buffer;
  }

  async function sendBatch(messages: Record<string, unknown>[]): Promise<void> {
    if (messages.length === 0) return;

    // Separate track events from engage (profile) events
    const trackEvents = messages.filter((m) => m._type === "track");
    const engageEvents = messages.filter((m) => m._type === "engage");

    if (trackEvents.length > 0) {
      const data = trackEvents.map((m) => {
        const { _type, ...rest } = m;
        return rest;
      });

      await cb.execute(async () => {
        const response = await fetch(`${MIXPANEL_API}/import?strict=1`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Mixpanel track batch failed (${response.status}): ${text}`);
        }
      });
    }

    if (engageEvents.length > 0) {
      const data = engageEvents.map((m) => {
        const { _type, ...rest } = m;
        return rest;
      });

      await cb.execute(async () => {
        const response = await fetch(`${MIXPANEL_API}/engage#profile-batch-update`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Mixpanel engage batch failed (${response.status}): ${text}`);
        }
      });
    }

    logger.debug("mixpanel batch sent", {
      trackCount: trackEvents.length,
      engageCount: engageEvents.length,
    });
  }

  return {
    name: "mixpanel",

    async init(config: AnalyticsConfig): Promise<void> {
      token = (config.token as string) ?? process.env.MIXPANEL_TOKEN ?? "";
      if (!token) {
        throw new Error("Mixpanel requires token (config or MIXPANEL_TOKEN env var)");
      }

      buffer = createEventBuffer({
        maxSize: (config.bufferMaxSize as number) ?? 100,
        flushIntervalMs: (config.bufferFlushIntervalMs as number) ?? 10_000,
        onFlush: sendBatch,
      });

      logger.info("mixpanel provider initialized");
    },

    async track(event: TrackEvent): Promise<void> {
      requireBuffer().add({
        _type: "track",
        event: event.event,
        properties: {
          ...event.properties,
          token,
          distinct_id: event.userId ?? event.anonymousId ?? "anonymous",
          time: event.timestamp ? new Date(event.timestamp).getTime() / 1000 : Date.now() / 1000,
        },
      });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      requireBuffer().add({
        _type: "engage",
        $token: token,
        $distinct_id: payload.userId,
        $set: payload.traits,
      });
    },

    async group(payload: GroupPayload): Promise<void> {
      // Mixpanel uses group profiles via the engage endpoint
      requireBuffer().add({
        _type: "engage",
        $token: token,
        $distinct_id: payload.userId,
        $set: {
          $group_id: payload.groupId,
          ...payload.traits,
        },
      });
    },

    async page(payload: PagePayload): Promise<void> {
      requireBuffer().add({
        _type: "track",
        event: "$mp_web_page_view",
        properties: {
          ...payload.properties,
          token,
          distinct_id: payload.userId ?? payload.anonymousId ?? "anonymous",
          $current_url: payload.properties?.url,
          page_name: payload.name,
          page_category: payload.category,
        },
      });
    },

    async flush(): Promise<void> {
      await requireBuffer().flush();
    },

    async close(): Promise<void> {
      await requireBuffer().close();
    },
  };
}

// Self-register factory
registerProvider("mixpanel", createMixpanelProvider);
