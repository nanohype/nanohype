import type { Notification, NotificationResult } from "../../types.js";
import type { ChannelProvider } from "../types.js";
import { registerChannel } from "../registry.js";
import { createCircuitBreaker } from "../../resilience/circuit-breaker.js";

// ── Web Push Provider ───────────────────────────────────────────────
//
// Sends browser push notifications via the Web Push protocol. Requires
// the following environment variables:
//   VAPID_PUBLIC_KEY   — VAPID public key
//   VAPID_PRIVATE_KEY  — VAPID private key
//   VAPID_SUBJECT      — VAPID subject (mailto: or https: URL)
//
// The notification.to field should be a JSON-serialized PushSubscription
// object from the browser Push API.
//
// Self-registers as "push:web-push" on import.
//

const cb = createCircuitBreaker();

const webPushProvider: ChannelProvider = {
  name: "web-push",
  channel: "push",

  async send(notification: Notification): Promise<NotificationResult> {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return {
        success: false,
        error: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT environment variables are required",
      };
    }

    try {
      const webpush = await import("web-push");

      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

      const subscription = JSON.parse(notification.to);
      const payload = JSON.stringify({
        title: notification.subject ?? "Notification",
        body: notification.body,
        ...(notification.metadata ?? {}),
      });

      const result = await cb.execute(() =>
        webpush.sendNotification(subscription, payload)
      );

      return {
        success: result.statusCode >= 200 && result.statusCode < 300,
        messageId: result.headers.location as string | undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  },

  async sendBatch(notifications: Notification[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    for (const notification of notifications) {
      results.push(await this.send(notification));
    }
    return results;
  },
};

// Self-register
registerChannel(webPushProvider);
