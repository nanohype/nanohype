// ── Analytics Provider Interface ───────────────────────────────────
//
// All analytics providers implement this interface. The registry
// stores provider factories -- each call to getProvider() returns a
// fresh instance with its own circuit breaker, API client state,
// and event buffer.
//
// No module-level mutable state: API clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type {
  TrackEvent,
  IdentifyPayload,
  GroupPayload,
  PagePayload,
  AnalyticsConfig,
} from "../types.js";

/** Provider factory -- returns a new AnalyticsProvider instance each time. */
export type AnalyticsProviderFactory = () => AnalyticsProvider;

export interface AnalyticsProvider {
  /** Unique provider name (e.g. "posthog", "segment", "mixpanel"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: AnalyticsConfig): Promise<void>;

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

  /** Gracefully shut down the provider, flushing remaining events. */
  close(): Promise<void>;
}
