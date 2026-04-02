// ── Notification Core Types ─────────────────────────────────────────
//
// Shared interfaces for notifications, configuration, results, and
// templates. These are channel-agnostic — every channel provider
// (email, SMS, push) works against the same shapes.
//

/** Supported notification channels. */
export type NotificationChannel = "email" | "sms" | "push";

/** Configuration passed to createNotifier. */
export interface NotificationConfig {
  /** Provider-specific connection or configuration options. */
  [key: string]: unknown;
}

/** A notification to be sent through a channel. */
export interface Notification {
  /** Target channel for delivery. */
  channel: NotificationChannel;

  /** Recipient address (email, phone number, or push subscription endpoint). */
  to: string;

  /** Notification subject line (used by email and push). */
  subject?: string;

  /** Notification body content. */
  body: string;

  /** Sender address or name (channel-specific). */
  from?: string;

  /** Additional channel-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Result of a send operation. */
export interface NotificationResult {
  /** Whether the send was successful. */
  success: boolean;

  /** Provider-assigned message identifier. */
  messageId?: string;

  /** Error message if the send failed. */
  error?: string;
}

/** Template for rendering notifications with variable substitution. */
export interface NotificationTemplate {
  /** Template name for identification. */
  name: string;

  /** Target channel for this template. */
  channel: NotificationChannel;

  /** Subject template with {{variable}} placeholders. */
  subject?: string;

  /** Body template with {{variable}} placeholders. */
  body: string;
}
