import { Client, EmbedBuilder, ChannelType } from "discord.js";
import type { Config } from "../config.js";
import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";

// ── Thread Context ───────────────────────────────────────────────────
//
// Maintains conversation history per Discord channel/thread so the LLM
// can produce contextual multi-turn responses. Each context stores up
// to MAX_CONTEXT_MESSAGES to bound memory usage.
//

interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

const channelContexts = new Map<string, ContextMessage[]>();
const MAX_CONTEXT_MESSAGES = 20;

function getContext(channelId: string): ContextMessage[] {
  return channelContexts.get(channelId) ?? [];
}

function addToContext(channelId: string, message: ContextMessage): void {
  const context = getContext(channelId);
  context.push(message);

  if (context.length > MAX_CONTEXT_MESSAGES) {
    context.splice(0, context.length - MAX_CONTEXT_MESSAGES);
  }

  channelContexts.set(channelId, context);
}

// ── Message Create Handler ───────────────────────────────────────────
//
// Responds to direct messages (DMs) to the bot and messages that
// mention the bot in guild channels. Ignores messages from other bots.
// Uses Discord embeds for rich formatting when responses are long.
//

const EMBED_THRESHOLD = 500;

export function registerMessageCreateHandler(client: Client, config: Config): void {
  client.on("messageCreate", async (message) => {
    // Ignore messages from bots (including self)
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned = message.mentions.has(client.user!);

    // Only respond to DMs or direct mentions
    if (!isDM && !isMentioned) return;

    // Strip the bot mention from the message text
    let userText = message.content;
    if (isMentioned && client.user) {
      userText = userText.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    }

    if (!userText) {
      await message.reply("Hey! Ask me something and I'll do my best to help.");
      return;
    }

    const channelId = message.channel.id;
    addToContext(channelId, { role: "user", content: userText });

    try {
      // Show typing indicator while generating response
      await message.channel.sendTyping();

      const provider = getProvider(config.LLM_PROVIDER);
      const context = getContext(channelId);

      const response = await provider.chat(
        "You are a helpful Discord bot assistant. Keep responses concise and well-formatted for Discord. Use Discord markdown for formatting (bold, italic, code blocks, etc.).",
        context,
      );

      addToContext(channelId, { role: "assistant", content: response });

      // Use embeds for longer responses to keep the chat clean
      if (response.length > EMBED_THRESHOLD) {
        const embed = new EmbedBuilder()
          .setDescription(response.slice(0, 4096))
          .setColor(0x5865f2)
          .setTimestamp();

        await message.reply({ embeds: [embed] });
      } else {
        await message.reply(response);
      }
    } catch (error) {
      logger.error("Failed to generate AI response", {
        error: error instanceof Error ? error.message : String(error),
        channel: channelId,
      });

      await message.reply("Sorry, I encountered an error processing your message. Please try again.");
    }
  });
}
