import type { Notification, NotificationResult } from "../../types.js";
import type { ChannelProvider } from "../types.js";
import { registerChannel } from "../registry.js";
import { createCircuitBreaker } from "../../resilience/circuit-breaker.js";

// ── Resend Email Provider ───────────────────────────────────────────
//
// Sends email notifications via the Resend API. Requires the
// RESEND_API_KEY environment variable. Uses the `resend` npm package
// for API communication.
//
// Self-registers as "email:resend" on import.
//

const cb = createCircuitBreaker();

const resendProvider: ChannelProvider = {
  name: "resend",
  channel: "email",

  async send(notification: Notification): Promise<NotificationResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: "RESEND_API_KEY environment variable is not set" };
    }

    try {
      const { Resend } = await import("resend");
      const client = new Resend(apiKey);

      const result = await cb.execute(() =>
        client.emails.send({
          from: notification.from ?? "noreply@example.com",
          to: notification.to,
          subject: notification.subject ?? "",
          text: notification.body,
        })
      );

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      return { success: true, messageId: result.data?.id };
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
registerChannel(resendProvider);
