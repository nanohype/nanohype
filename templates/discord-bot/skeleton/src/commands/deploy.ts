import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadConfig } from "../config.js";
import { askCommandDefinition } from "./ask.js";

// ── Deploy Commands ──────────────────────────────────────────────────
//
// Registers slash commands with the Discord API. Run this script once
// after adding or modifying commands:
//
//   npm run deploy-commands
//
// Commands are registered globally (available in all guilds). For
// development, change to guild-specific registration for instant
// updates (global commands can take up to an hour to propagate).
//

const config = loadConfig();

const commands = [
  askCommandDefinition.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

try {
  console.log(`Registering ${commands.length} application command(s)...`);

  await rest.put(
    Routes.applicationCommands(config.DISCORD_CLIENT_ID),
    { body: commands },
  );

  console.log("Commands registered successfully.");
} catch (error) {
  console.error("Failed to register commands:", error);
  process.exit(1);
}
