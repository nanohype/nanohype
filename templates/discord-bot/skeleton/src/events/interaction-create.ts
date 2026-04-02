import { Client, EmbedBuilder } from "discord.js";
import type { Config } from "../config.js";
import { handleAskCommand } from "../commands/ask.js";
import { logger } from "../logger.js";

// ── Interaction Create Handler ───────────────────────────────────────
//
// Routes slash command interactions to their handlers. Discord sends
// all interactions through a single event — this dispatcher matches
// the command name and delegates to the appropriate handler.
//

export function registerInteractionCreateHandler(client: Client, config: Config): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    logger.debug("Slash command received", {
      command: interaction.commandName,
      user: interaction.user.tag,
      guild: interaction.guild?.name,
    });

    try {
      switch (interaction.commandName) {
        case "ask":
          await handleAskCommand(interaction, config);
          break;
        default:
          await interaction.reply({
            content: `Unknown command: ${interaction.commandName}`,
            ephemeral: true,
          });
      }
    } catch (error) {
      logger.error("Failed to handle interaction", {
        error: error instanceof Error ? error.message : String(error),
        command: interaction.commandName,
      });

      const errorEmbed = new EmbedBuilder()
        .setDescription("Sorry, something went wrong processing your command.")
        .setColor(0xed4245);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  });
}
