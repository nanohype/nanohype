// ── Module Analytics -- Main Exports ──────────────────────────────
//
// Public API for the analytics module. Imports all providers to
// trigger self-registration, then exposes createAnalyticsClient as
// the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { AnalyticsClientConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import { analyticsEventsTracked, analyticsFlushTotal, analyticsFlushDurationMs } from "./metrics.js";
import type { AnalyticsProvider } from "./providers/types.js";
import type {
  TrackEvent,
  IdentifyPayload,
  GroupPayload,
  PagePayload,
  AnalyticsConfig,
} from "./types.js";
import type { AnalyticsClientConfig } from "./config.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { AnalyticsProvider, AnalyticsProviderFactory } from "./providers/types.js";
export type {
  TrackEvent,
  IdentifyPayload,
  GroupPayload,
  PagePayload,
  AnalyticsConfig,
  EventBufferConfig,
} from "./types.js";
export { createEventBuffer } from "./buffer/event-buffer.js";
export type { EventBuffer, EventBufferOptions } from "./buffer/event-buffer.js";
export { createHonoAnalytics } from "./middleware/hono.js";
export { createExpressAnalytics } from "./middleware/express.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
export { AnalyticsClientConfigSchema } from "./config.js";
export type { AnalyticsClientConfig } from "./config.js";

// ── Analytics Client Facade ──────────────────────────────────────

export interface AnalyticsClient {
  /** The underlying provider instance. */
  provider: AnalyticsProvider;

  /** Track an event. */
  track(event: TrackEvent): Promise<void>;

  /** Identify a user with traits. */
  identify(payload: IdentifyPayload): Promise<void>;

  /** Associate a user with a group/organization. */
  group(payload: GroupPayload): Promise<void>;

  /** Track a page view. */
  page(payload: PagePayload): Promise<void>;

  /** Flush any buffered events to the provider. */
  flush(): Promise<void>;

  /** Shut down the client, flushing remaining events. */
  close(): Promise<void>;
}

/** Zod schema for validating createAnalyticsClient arguments. */
const CreateAnalyticsClientSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.record(z.unknown()).default({}),
});

/**
 * Create a configured analytics client backed by the named provider.
 *
 * The provider must already be registered (built-in providers
 * self-register on import via the providers barrel).
 *
 *   const client = await createAnalyticsClient("posthog", {
 *     apiKey: "phc_...",
 *   });
 *
 *   await client.track({ event: "signup", userId: "user-1" });
 *   await client.identify({ userId: "user-1", traits: { plan: "pro" } });
 *   await client.flush();
 */
export async function createAnalyticsClient(
  providerName: string = "mock",
  config: AnalyticsConfig = {},
): Promise<AnalyticsClient> {
  const parsed = CreateAnalyticsClientSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid analytics config: ${issues}`);
  }

  validateBootstrap();

  const provider = getProvider(providerName);
  await provider.init(config);

  return {
    provider,

    async track(event: TrackEvent): Promise<void> {
      await provider.track(event);
      analyticsEventsTracked.add(1, { provider: providerName, event: event.event });
    },

    async identify(payload: IdentifyPayload): Promise<void> {
      await provider.identify(payload);
      analyticsEventsTracked.add(1, { provider: providerName, event: "$identify" });
    },

    async group(payload: GroupPayload): Promise<void> {
      await provider.group(payload);
      analyticsEventsTracked.add(1, { provider: providerName, event: "$group" });
    },

    async page(payload: PagePayload): Promise<void> {
      await provider.page(payload);
      analyticsEventsTracked.add(1, { provider: providerName, event: "$page" });
    },

    async flush(): Promise<void> {
      const start = performance.now();
      await provider.flush();
      analyticsFlushTotal.add(1, { provider: providerName });
      analyticsFlushDurationMs.record(performance.now() - start, { provider: providerName });
    },

    async close(): Promise<void> {
      const start = performance.now();
      await provider.close();
      analyticsFlushTotal.add(1, { provider: providerName });
      analyticsFlushDurationMs.record(performance.now() - start, { provider: providerName });
    },
  };
}
