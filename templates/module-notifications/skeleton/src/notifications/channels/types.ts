// ── Channel Provider Interface ──────────────────────────────────────
//
// All channel providers implement this interface. The registry pattern
// allows new providers to be added by importing a provider module
// that calls registerChannel() at the module level.
//

import type { Notification, NotificationResult, NotificationChannel } from "../types.js";

export interface ChannelProvider {
  /** Unique provider name (e.g. "resend", "sendgrid", "twilio"). */
  readonly name: string;

  /** Which notification channel this provider handles. */
  readonly channel: NotificationChannel;

  /** Send a single notification. */
  send(notification: Notification): Promise<NotificationResult>;

  /** Send multiple notifications. Default implementation sends sequentially. */
  sendBatch(notifications: Notification[]): Promise<NotificationResult[]>;
}
