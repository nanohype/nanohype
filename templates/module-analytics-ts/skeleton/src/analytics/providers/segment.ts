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

// ── Segment Provider ──────────────────────────────────────────────
//
// Segment HTTP API via native fetch. Buffers events locally and
// sends them in batches via the /v1/batch endpoint. Each factory
// call returns a new instance with its own buffer and circuit breaker.
//
// Auth: SEGMENT_WRITE_KEY environment variable.
//

const SEGMENT_API = "https://api.segment.io";

function createSegmentProvider(): AnalyticsProvider {
  let writeKey = "";
  const cb = createCircuitBreaker();
  let buffer: ReturnType<typeof createEventBuffer> | undefined;

  function requireBuffer(): ReturnType<typeof createEventBuffer> {
    if (!buffer) throw new Error("Provider not initialized — call init() first");
    return buffer;
  }

  async function sendBatch(messages: Record<string, unknown>[]): Promise<void> {
    if (messages.length === 0) return;

    const auth = Buffer.from(`${writeKey}:`).toString("base64");

    await cb.execute(async () => {
      const response = await fetch(`${SEGMENT_API}/v1/batch`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ batch: messages }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Segment batch failed (${response.status}): ${text}`);
      }
    });

    logger.debug("segment batch sent", { count: messages.length });
  }

  return {
    name: "segment",

    async init(config: AnalyticsConfig): Promise<void> {
      writeKey = (config.writeKey as string) ?? process.env.SEGMENT_WRITE_KEY ?? "";
      if (!writeKey) {
        throw new Error("Segment requires writeKey (config or SEGMENT_WRITE_KEY env var)");
      }

      buffer = createEventBuffer({
        maxSize: (config.bufferMaxSize as number) ?? 100,
        flushIntervalMs: (config.bufferFlushIntervalMs as number) ?? 10_000,
        onFlush: sendBatch,
      });

      logger.info("segment provider initialized");
    },

    async track(event: TrackEvent): Promise<void> {
      requireBuffer().add({
        type: "track",
        event: event.event,
        userId: event.userId,
        anonymousId: event.anonymousId,
        properties: event.properties,
        timestamp: event.timestamp ?? new Date().toISOString(),
      });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      requireBuffer().add({
        type: "identify",
        userId: payload.userId,
        traits: payload.traits,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async group(payload: GroupPayload): Promise<void> {
      requireBuffer().add({
        type: "group",
        userId: payload.userId,
        groupId: payload.groupId,
        traits: payload.traits,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      });
    },

    async page(payload: PagePayload): Promise<void> {
      requireBuffer().add({
        type: "page",
        userId: payload.userId,
        anonymousId: payload.anonymousId,
        name: payload.name,
        category: payload.category,
        properties: payload.properties,
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
registerProvider("segment", createSegmentProvider);
