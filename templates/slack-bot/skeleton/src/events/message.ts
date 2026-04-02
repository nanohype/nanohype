import type { App } from "@slack/bolt";
import type { Config } from "../config.js";
import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";

// ── Thread Context ───────────────────────────────────────────────────
//
// Maintains conversation history per Slack thread so the LLM can
// produce contextual multi-turn responses. Each thread stores up to
// MAX_CONTEXT_MESSAGES to bound memory usage.
//

interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

const threadContexts = new Map<string, ContextMessage[]>();
const MAX_CONTEXT_MESSAGES = 20;

function getThreadKey(channel: string, threadTs: string | undefined, ts: string): string {
  return `${channel}:${threadTs ?? ts}`;
}

function getContext(key: string): ContextMessage[] {
  return threadContexts.get(key) ?? [];
}

function addToContext(key: string, message: ContextMessage): void {
  const context = getContext(key);
  context.push(message);

  // Trim to keep memory bounded
  if (context.length > MAX_CONTEXT_MESSAGES) {
    context.splice(0, context.length - MAX_CONTEXT_MESSAGES);
  }

  threadContexts.set(key, context);
}

// ── Message Handler ──────────────────────────────────────────────────
//
// Responds to direct messages (DMs) to the bot. Ignores messages from
// other bots and messages in channels (use app_mention for those).
// Replies in-thread to keep the channel clean.
//

export function registerMessageHandler(app: App, config: Config): void {
  app.message(async ({ message, say, client }) => {
    // Only handle standard user messages (not bot messages, edits, etc.)
    if (message.subtype || !("text" in message) || !message.text) return;
    if ("bot_id" in message && message.bot_id) return;

    // Only respond to DMs (im channels)
    const info = await client.conversations.info({ channel: message.channel });
    if (!info.channel?.is_im) return;

    const threadKey = getThreadKey(message.channel, message.thread_ts, message.ts);
    addToContext(threadKey, { role: "user", content: message.text });

    try {
      const provider = getProvider(config.LLM_PROVIDER);
      const context = getContext(threadKey);

      const response = await provider.chat(
        "You are a helpful Slack bot assistant. Keep responses concise and well-formatted for Slack. Use Slack mrkdwn syntax for formatting.",
        context,
      );

      addToContext(threadKey, { role: "assistant", content: response });

      await say({
        text: response,
        thread_ts: message.thread_ts ?? message.ts,
      });
    } catch (error) {
      logger.error("Failed to generate AI response", {
        error: error instanceof Error ? error.message : String(error),
        channel: message.channel,
      });

      await say({
        text: "Sorry, I encountered an error processing your message. Please try again.",
        thread_ts: message.thread_ts ?? message.ts,
      });
    }
  });
}
