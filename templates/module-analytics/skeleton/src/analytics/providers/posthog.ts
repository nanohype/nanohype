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

// ── PostHog Provider ──────────────────────────────────────────────
//
// PostHog API via native fetch. Buffers events locally and sends
// them in batches via the /batch endpoint. Each factory call returns
// a new instance with its own buffer and circuit breaker.
//
// Auth: POSTHOG_API_KEY environment variable.
//

function createPosthogProvider(): AnalyticsProvider {
  let apiKey = "";
  let host = "";
  const cb = createCircuitBreaker();
  let buffer: ReturnType<typeof createEventBuffer> | undefined;

  function requireBuffer(): ReturnType<typeof createEventBuffer> {
    if (!buffer) throw new Error("Provider not initialized — call init() first");
    return buffer;
  }

  async function sendBatch(messages: Record<string, unknown>[]): Promise<void> {
    if (messages.length === 0) return;

    await cb.execute(async () => {
      const response = await fetch(`${host}/batch`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          batch: messages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`PostHog batch failed (${response.status}): ${text}`);
      }
    });

    logger.debug("posthog batch sent", { count: messages.length });
  }

  return {
    name: "posthog",

    async init(config: AnalyticsConfig): Promise<void> {
      apiKey = (config.apiKey as string) ?? process.env.POSTHOG_API_KEY ?? "";
      host = ((config.host as string) ?? process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");
      if (!apiKey) {
        throw new Error("PostHog requires apiKey (config or POSTHOG_API_KEY env var)");
      }

      buffer = createEventBuffer({
        maxSize: (config.bufferMaxSize as number) ?? 100,
        flushIntervalMs: (config.bufferFlushIntervalMs as number) ?? 10_000,
        onFlush: sendBatch,
      });

      logger.info("posthog provider initialized", { host });
    },

    async track(event: TrackEvent): Promise<void> {
      requireBuffer().add({
        event: event.event,
        distinct_id: event.userId ?? event.anonymousId ?? "anonymous",
        properties: {
          ...event.properties,
          $lib: "__PROJECT_NAME__",
        },
        timestamp: event.timestamp ?? new Date().toISOString(),
      });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      requireBuffer().add({
        event: "$identify",
        distinct_id: payload.userId,
        properties: {
          $set: payload.traits,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async group(payload: GroupPayload): Promise<void> {
      requireBuffer().add({
        event: "$groupidentify",
        distinct_id: payload.userId,
        properties: {
          $group_type: "company",
          $group_key: payload.groupId,
          $group_set: payload.traits,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async page(payload: PagePayload): Promise<void> {
      requireBuffer().add({
        event: "$pageview",
        distinct_id: payload.userId ?? payload.anonymousId ?? "anonymous",
        properties: {
          $current_url: payload.properties?.url,
          $referrer: payload.properties?.referrer,
          ...payload.properties,
        },
        timestamp: payload.timestamp ?? new Date().toISOString(),
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
registerProvider("posthog", createPosthogProvider);
