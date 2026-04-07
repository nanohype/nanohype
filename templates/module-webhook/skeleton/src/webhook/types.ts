// ── Webhook Core Types ─────────────────────────────────────────────
//
// Shared interfaces for webhook events, payloads, delivery results,
// and configuration. These are provider-agnostic — receiver and
// sender operate against the same shapes.
//

import type { WebhookEventLog } from "./event-log.js";

/** Unique event identifier. */
export type EventId = string;

/** A webhook event received or to be sent. */
export interface WebhookEvent {
  /** Unique identifier for this event. */
  id: EventId;

  /** Event type used to route to the correct handler (e.g. "push", "deploy.completed"). */
  event: string;

  /** Arbitrary payload carried by the event. */
  payload: unknown;

  /** ISO-8601 timestamp of when the event was created. */
  timestamp: string;
}

/** Raw webhook payload before parsing. */
export interface WebhookPayload {
  /** The raw request body as a string. */
  rawBody: string;

  /** HTTP headers from the incoming request. */
  headers: Record<string, string | undefined>;
}

/** Result of a webhook delivery attempt. */
export interface DeliveryResult {
  /** Whether the delivery ultimately succeeded. */
  ok: boolean;

  /** HTTP status code from the final attempt, or 0 on network error. */
  statusCode: number;

  /** Total number of attempts made (including the initial attempt). */
  attempts: number;

  /** Error message if the delivery failed. */
  error?: string;
}

/** Options for sending a webhook. */
export interface DeliveryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;

  /** Base delay in milliseconds for exponential backoff (default: 1000). */
  baseDelay?: number;

  /** Additional headers to include in the request. */
  headers?: Record<string, string>;
}

/** Configuration for creating a webhook receiver. */
export interface ReceiverConfig {
  /** Shared secret used for signature verification. */
  secret: string;

  /** Name of the signature provider to use (default: "__SIGNATURE_METHOD__"). */
  signatureMethod?: string;

  /** Header name containing the signature (default: "x-signature"). */
  signatureHeader?: string;

  /** Header name containing the event type (default: "x-event"). */
  eventHeader?: string;

  /** Optional event log for recording received events. */
  eventLog?: WebhookEventLog;
}

/** Configuration for creating a webhook sender. */
export interface SenderConfig {
  /** Shared secret used for signing outgoing payloads. */
  secret: string;

  /** Name of the signature provider to use (default: "__SIGNATURE_METHOD__"). */
  signatureMethod?: string;

  /** Header name to put the signature in (default: "x-signature"). */
  signatureHeader?: string;

  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;

  /** Base delay in milliseconds for exponential backoff (default: 1000). */
  baseDelay?: number;

  /** Timeout in milliseconds for each delivery attempt (default: 30000). */
  timeoutMs?: number;

  /** Optional event log for recording sent events. */
  eventLog?: WebhookEventLog;
}

/** Handler function for a specific event type. */
export type EventHandler = (event: WebhookEvent) => Promise<void>;

/** Map of event types to their handler functions. */
export type HandlerMap = Record<string, EventHandler>;

/** Result of handling an incoming webhook request. */
export interface HandleResult {
  /** Whether the signature was valid. */
  verified: boolean;

  /** The parsed event, if signature verification passed. */
  event?: WebhookEvent;

  /** Error message if verification or parsing failed. */
  error?: string;
}
