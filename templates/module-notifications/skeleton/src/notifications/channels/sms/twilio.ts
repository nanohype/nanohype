import type { Notification, NotificationResult } from "../../types.js";
import type { ChannelProvider } from "../types.js";
import { registerChannel } from "../registry.js";
import { createCircuitBreaker } from "../../resilience/circuit-breaker.js";

// ── Twilio SMS Provider ─────────────────────────────────────────────
//
// Sends SMS notifications via the Twilio API. Requires the following
// environment variables:
//   TWILIO_ACCOUNT_SID  — Twilio account SID
//   TWILIO_AUTH_TOKEN   — Twilio auth token
//   TWILIO_FROM_NUMBER  — Default sender phone number
//
// Self-registers as "sms:twilio" on import.
//

const cb = createCircuitBreaker();

const twilioProvider: ChannelProvider = {
  name: "twilio",
  channel: "sms",

  async send(notification: Notification): Promise<NotificationResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = notification.from ?? process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required",
      };
    }

    if (!fromNumber) {
      return {
        success: false,
        error: "Sender phone number is required (notification.from or TWILIO_FROM_NUMBER)",
      };
    }

    try {
      const twilio = await import("twilio");
      const client = twilio.default(accountSid, authToken);

      const message = await cb.execute(() =>
        client.messages.create({
          from: fromNumber,
          to: notification.to,
          body: notification.body,
        })
      );

      return { success: true, messageId: message.sid };
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
registerChannel(twilioProvider);
