import type { Notification, NotificationResult } from "../../types.js";
import type { ChannelProvider } from "../types.js";
import { registerChannel } from "../registry.js";

// ── Mock Email Provider ───────────────────────────────────────────
//
// Logs all sent emails to an in-memory array and returns success
// with a fake message ID. No external API calls. Useful for local
// development, testing, and verifying notification logic.
//
// Self-registers as "email:mock" on import.
//

export interface SentEmail {
  to: string;
  from: string;
  subject: string;
  body: string;
  sentAt: string;
  messageId: string;
}

/** In-memory log of all emails sent through the mock provider. */
export const sentEmails: SentEmail[] = [];

/** Clear the sent email log (useful between test runs). */
export function clearSentEmails(): void {
  sentEmails.length = 0;
}

let messageCounter = 0;

const mockEmailProvider: ChannelProvider = {
  name: "mock",
  channel: "email",

  async send(notification: Notification): Promise<NotificationResult> {
    messageCounter++;
    const messageId = `mock-email-${messageCounter.toString().padStart(6, "0")}`;

    sentEmails.push({
      to: notification.to,
      from: notification.from ?? "noreply@mock.local",
      subject: notification.subject ?? "",
      body: notification.body,
      sentAt: new Date().toISOString(),
      messageId,
    });

    return {
      success: true,
      messageId,
    };
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
registerChannel(mockEmailProvider);
