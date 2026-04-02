import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Config } from "../config.js";
import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";

// ── /ask Command ─────────────────────────────────────────────────────
//
// Slash command for on-demand AI queries. The user types `/ask <question>`
// and receives a response formatted as a Discord embed. The command
// defers its reply to allow time for the LLM to generate a response.
//

export const askCommandDefinition = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask the AI a question")
  .addStringOption((option) =>
    option
      .setName("question")
      .setDescription("Your question")
      .setRequired(true)
  );

export async function handleAskCommand(
  interaction: ChatInputCommandInteraction,
  config: Config,
): Promise<void> {
  const question = interaction.options.getString("question", true);

  // Defer reply — LLM responses can take several seconds
  await interaction.deferReply();

  try {
    const provider = getProvider(config.LLM_PROVIDER);

    const response = await provider.chat(
      "You are a helpful assistant responding to a Discord slash command. Keep responses concise and well-formatted for Discord. Use Discord markdown for formatting.",
      [{ role: "user", content: question }],
    );

    const embed = new EmbedBuilder()
      .setTitle("Answer")
      .setDescription(response.slice(0, 4096))
      .setColor(0x5865f2)
      .setFooter({ text: `Asked by ${interaction.user.displayName}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("Failed to generate AI response for /ask", {
      error: error instanceof Error ? error.message : String(error),
      user: interaction.user.tag,
    });

    const errorEmbed = new EmbedBuilder()
      .setDescription("Sorry, I encountered an error processing your question. Please try again.")
      .setColor(0xed4245);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
