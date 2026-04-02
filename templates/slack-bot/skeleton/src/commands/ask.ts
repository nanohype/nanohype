import type { App } from "@slack/bolt";
import type { Config } from "../config.js";
import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";

// ── /ask Slash Command ───────────────────────────────────────────────
//
// Provides a slash command interface for quick AI queries. The user
// types `/ask <question>` and receives an ephemeral response (visible
// only to them) or a public response depending on configuration.
//
// Ephemeral responses avoid noise in busy channels. Switch to `say()`
// if public responses are preferred.
//

export function registerAskCommand(app: App, config: Config): void {
  app.command("/ask", async ({ command, ack, respond }) => {
    // Acknowledge within 3 seconds (Slack requirement)
    await ack();

    const question = command.text.trim();

    if (!question) {
      await respond({
        response_type: "ephemeral",
        text: "Usage: `/ask <your question>`",
      });
      return;
    }

    try {
      const provider = getProvider(config.LLM_PROVIDER);

      const response = await provider.chat(
        "You are a helpful assistant responding to a Slack slash command. Keep responses concise and well-formatted for Slack. Use Slack mrkdwn syntax.",
        [{ role: "user", content: question }],
      );

      await respond({
        response_type: "ephemeral",
        text: response,
      });
    } catch (error) {
      logger.error("Failed to generate AI response for /ask", {
        error: error instanceof Error ? error.message : String(error),
        user: command.user_id,
        channel: command.channel_id,
      });

      await respond({
        response_type: "ephemeral",
        text: "Sorry, I encountered an error processing your question. Please try again.",
      });
    }
  });
}
