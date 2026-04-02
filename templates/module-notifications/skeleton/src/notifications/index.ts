// ── Module Notifications — Main Exports ─────────────────────────────
//
// Public API for the notifications module. Import channels so they
// self-register, then expose createNotifier as the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { getChannel, listChannels } from "./channels/index.js";
import type { ChannelProvider } from "./channels/types.js";
import type {
  Notification,
  NotificationConfig,
  NotificationResult,
  NotificationTemplate,
  NotificationChannel,
} from "./types.js";
import { renderTemplate, interpolate } from "./template.js";

// Re-export everything consumers need
export { renderTemplate, interpolate } from "./template.js";
export { getChannel, listChannels, registerChannel } from "./channels/index.js";
export type { ChannelProvider } from "./channels/types.js";
export type {
  Notification,
  NotificationConfig,
  NotificationResult,
  NotificationTemplate,
  NotificationChannel,
} from "./types.js";

// ── Notifier Facade ─────────────────────────────────────────────────

export interface Notifier {
  /** The email channel provider instance. */
  emailProvider: ChannelProvider;

  /** Send a single notification through the appropriate channel. */
  send(notification: Notification): Promise<NotificationResult>;

  /** Send multiple notifications, routing each to its channel. */
  sendBatch(notifications: Notification[]): Promise<NotificationResult[]>;

  /** Render a template with variables and send the resulting notification. */
  renderAndSend(
    template: NotificationTemplate,
    variables: Record<string, string>,
    to: string,
    from?: string,
  ): Promise<NotificationResult>;
}

/** Channel-to-provider mapping for non-email channels. */
export interface ChannelProviderMap {
  sms?: string;
  push?: string;
}

/**
 * Create a configured notifier instance.
 *
 * The email provider must already be registered (built-in providers
 * self-register on import via the channels barrel). Optionally supply
 * provider names for SMS and push channels.
 *
 *   const notifier = createNotifier("resend");
 *   await notifier.send({ channel: "email", to: "a@b.com", body: "Hello!" });
 *   await notifier.sendBatch([...notifications]);
 */
/** Zod schema for validating createNotifier arguments. */
const CreateNotifierSchema = z.object({
  emailProviderName: z.string().min(1, "emailProviderName must be a non-empty string"),
  providers: z.object({
    sms: z.string().optional(),
    push: z.string().optional(),
  }).optional(),
  config: z.object({}).passthrough().optional(),
});

export function createNotifier(
  emailProviderName: string = "__EMAIL_PROVIDER__",
  providers: ChannelProviderMap = {},
  _config: NotificationConfig = {},
): Notifier {
  const parsed = CreateNotifierSchema.safeParse({ emailProviderName, providers, config: _config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid notifier config: ${issues}`);
  }

  validateBootstrap();

  const emailProvider = getChannel("email", emailProviderName);

  function resolveProvider(channel: NotificationChannel): ChannelProvider {
    if (channel === "email") {
      return emailProvider;
    }

    const providerName = channel === "sms" ? providers.sms : providers.push;
    if (!providerName) {
      throw new Error(
        `No provider configured for channel "${channel}". ` +
        `Pass { ${channel}: "providerName" } in the providers map.`,
      );
    }
    return getChannel(channel, providerName);
  }

  return {
    emailProvider,

    async send(notification: Notification): Promise<NotificationResult> {
      const provider = resolveProvider(notification.channel);
      return provider.send(notification);
    },

    async sendBatch(notifications: Notification[]): Promise<NotificationResult[]> {
      const results: NotificationResult[] = [];
      for (const notification of notifications) {
        const provider = resolveProvider(notification.channel);
        results.push(await provider.send(notification));
      }
      return results;
    },

    async renderAndSend(
      template: NotificationTemplate,
      variables: Record<string, string>,
      to: string,
      from?: string,
    ): Promise<NotificationResult> {
      const notification = renderTemplate(template, variables, to, from);
      return this.send(notification);
    },
  };
}
