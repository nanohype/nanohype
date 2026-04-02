import type { Notification, NotificationResult } from "../../types.js";
import type { ChannelProvider } from "../types.js";
import { registerChannel } from "../registry.js";

// ── SendGrid Email Provider ─────────────────────────────────────────
//
// Sends email notifications via the SendGrid API. Requires the
// SENDGRID_API_KEY environment variable. Uses the @sendgrid/mail
// npm package for API communication.
//
// Self-registers as "email:sendgrid" on import.
//

const sendgridProvider: ChannelProvider = {
  name: "sendgrid",
  channel: "email",

  async send(notification: Notification): Promise<NotificationResult> {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return { success: false, error: "SENDGRID_API_KEY environment variable is not set" };
    }

    try {
      const sgMail = await import("@sendgrid/mail");
      const client = sgMail.default;
      client.setApiKey(apiKey);

      const [response] = await client.send({
        from: notification.from ?? "noreply@example.com",
        to: notification.to,
        subject: notification.subject ?? "",
        text: notification.body,
      });

      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        messageId: response.headers["x-message-id"] as string | undefined,
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
registerChannel(sendgridProvider);
