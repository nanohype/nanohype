// ── Analytics Core Types ──────────────────────────────────────────
//
// Shared interfaces for event tracking, user identification, group
// assignment, page views, and configuration. These are provider-agnostic
// -- every backend implementation works against the same shapes.
//

export type { AnalyticsProvider, AnalyticsProviderFactory } from "./providers/types.js";

/** An event to track. */
export interface TrackEvent {
  /** Event name (e.g. "button_clicked", "purchase_completed"). */
  event: string;

  /** Distinct user identifier. */
  userId?: string;

  /** Anonymous session identifier. */
  anonymousId?: string;

  /** Event properties (arbitrary key-value pairs). */
  properties?: Record<string, unknown>;

  /** ISO-8601 timestamp. Defaults to now if omitted. */
  timestamp?: string;
}

/** Payload for identifying a user with traits. */
export interface IdentifyPayload {
  /** Distinct user identifier. */
  userId: string;

  /** User traits (e.g. name, email, plan). */
  traits?: Record<string, unknown>;

  /** ISO-8601 timestamp. */
  timestamp?: string;
}

/** Payload for associating a user with a group/organization. */
export interface GroupPayload {
  /** Distinct user identifier. */
  userId: string;

  /** Group identifier (e.g. company ID, team ID). */
  groupId: string;

  /** Group traits (e.g. name, plan, industry). */
  traits?: Record<string, unknown>;

  /** ISO-8601 timestamp. */
  timestamp?: string;
}

/** Payload for tracking a page view. */
export interface PagePayload {
  /** Distinct user identifier. */
  userId?: string;

  /** Anonymous session identifier. */
  anonymousId?: string;

  /** Page name. */
  name?: string;

  /** Page category. */
  category?: string;

  /** Additional page properties (url, referrer, title, etc.). */
  properties?: Record<string, unknown>;

  /** ISO-8601 timestamp. */
  timestamp?: string;
}

/** Configuration passed to createAnalyticsClient. */
export interface AnalyticsConfig {
  /** Provider-specific configuration values. */
  [key: string]: unknown;
}

/** Configuration for the event buffer. */
export interface EventBufferConfig {
  /** Maximum number of events before auto-flush. Default: 100. */
  maxSize?: number;

  /** Flush interval in milliseconds. Default: 10000 (10s). */
  flushIntervalMs?: number;
}
