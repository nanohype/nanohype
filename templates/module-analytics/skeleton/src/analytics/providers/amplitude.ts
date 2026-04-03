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

// ── Amplitude Provider ────────────────────────────────────────────
//
// Amplitude HTTP V2 API via native fetch. Buffers events locally
// and sends them in batches via the /2/httpapi endpoint. Each
// factory call returns a new instance with its own buffer and
// circuit breaker.
//
// Auth: AMPLITUDE_API_KEY environment variable.
//

const AMPLITUDE_API = "https://api2.amplitude.com";

function createAmplitudeProvider(): AnalyticsProvider {
  let apiKey = "";
  const cb = createCircuitBreaker();
  let buffer: ReturnType<typeof createEventBuffer> | undefined;

  function requireBuffer(): ReturnType<typeof createEventBuffer> {
    if (!buffer) throw new Error("Provider not initialized — call init() first");
    return buffer;
  }

  async function sendBatch(messages: Record<string, unknown>[]): Promise<void> {
    if (messages.length === 0) return;

    await cb.execute(async () => {
      const response = await fetch(`${AMPLITUDE_API}/2/httpapi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify({
          api_key: apiKey,
          events: messages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Amplitude batch failed (${response.status}): ${text}`);
      }
    });

    logger.debug("amplitude batch sent", { count: messages.length });
  }

  return {
    name: "amplitude",

    async init(config: AnalyticsConfig): Promise<void> {
      apiKey = (config.apiKey as string) ?? process.env.AMPLITUDE_API_KEY ?? "";
      if (!apiKey) {
        throw new Error("Amplitude requires apiKey (config or AMPLITUDE_API_KEY env var)");
      }

      buffer = createEventBuffer({
        maxSize: (config.bufferMaxSize as number) ?? 100,
        flushIntervalMs: (config.bufferFlushIntervalMs as number) ?? 10_000,
        onFlush: sendBatch,
      });

      logger.info("amplitude provider initialized");
    },

    async track(event: TrackEvent): Promise<void> {
      requireBuffer().add({
        event_type: event.event,
        user_id: event.userId,
        device_id: event.anonymousId,
        event_properties: event.properties,
        time: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
      });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      requireBuffer().add({
        event_type: "$identify",
        user_id: payload.userId,
        user_properties: {
          $set: payload.traits,
        },
        time: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
      });
    },

    async group(payload: GroupPayload): Promise<void> {
      requireBuffer().add({
        event_type: "$identify",
        user_id: payload.userId,
        groups: {
          company: payload.groupId,
        },
        group_properties: {
          $set: payload.traits,
        },
        time: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
      });
    },

    async page(payload: PagePayload): Promise<void> {
      requireBuffer().add({
        event_type: "[Amplitude] Page Viewed",
        user_id: payload.userId,
        device_id: payload.anonymousId,
        event_properties: {
          page_name: payload.name,
          page_category: payload.category,
          ...payload.properties,
        },
        time: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
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
registerProvider("amplitude", createAmplitudeProvider);
