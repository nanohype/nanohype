import type { JobDefinition } from "../../types.js";
import type { JobHandler } from "../types.js";

// ── Example Queue Job: Send Notification ──────────────────────────
//
// Processes a "send-notification" job from the queue. Replace this
// with your own queue job handlers — email delivery, webhook
// dispatch, data processing, etc.
//

export interface NotificationPayload {
  recipient: string;
  subject: string;
  body: string;
  channel: "email" | "sms" | "push";
}

export const sendNotification: JobHandler<NotificationPayload> = async (
  job: JobDefinition<NotificationPayload>
): Promise<void> => {
  const { recipient, subject, channel } = job.data;

  // A real handler would deliver the payload, e.g.:
  //
  //   await notificationService.send({
  //     to: recipient,
  //     subject,
  //     body: job.data.body,
  //     channel,
  //   });

  void recipient;
  void subject;
  void channel;
};
