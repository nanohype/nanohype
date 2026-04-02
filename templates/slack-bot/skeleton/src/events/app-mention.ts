import type { App } from "@slack/bolt";
import type { Config } from "../config.js";
import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";

// ── App Mention Handler ──────────────────────────────────────────────
//
// Responds when the bot is @mentioned in a channel. Strips the mention
// prefix from the message text before sending to the LLM. Replies
// in-thread to avoid cluttering the channel.
//

function stripMention(text: string): string {
  // Remove the <@BOTID> mention prefix
  return text.replace(/^<@[A-Z0-9]+>\s*/i, "").trim();
}

export function registerAppMentionHandler(app: App, config: Config): void {
  app.event("app_mention", async ({ event, say }) => {
    const userText = stripMention(event.text);

    if (!userText) {
      await say({
        text: "Hey! Ask me something and I'll do my best to help.",
        thread_ts: event.thread_ts ?? event.ts,
      });
      return;
    }

    try {
      const provider = getProvider(config.LLM_PROVIDER);

      const response = await provider.chat(
        "You are a helpful Slack bot assistant. Keep responses concise and well-formatted for Slack. Use Slack mrkdwn syntax for formatting.",
        [{ role: "user", content: userText }],
      );

      await say({
        text: response,
        thread_ts: event.thread_ts ?? event.ts,
      });
    } catch (error) {
      logger.error("Failed to generate AI response for mention", {
        error: error instanceof Error ? error.message : String(error),
        channel: event.channel,
      });

      await say({
        text: "Sorry, I encountered an error processing your request. Please try again.",
        thread_ts: event.thread_ts ?? event.ts,
      });
    }
  });
}
