import "dotenv/config";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { Client, GatewayIntentBits } from "discord.js";
import { registerMessageCreateHandler } from "./events/message-create.js";
import { registerInteractionCreateHandler } from "./events/interaction-create.js";

// ── Bootstrap ────────────────────────────────────────────────────────
//
// 1. Validate that all scaffolding placeholders have been replaced.
// 2. Validate configuration (exits on invalid env vars).
// 3. Import providers to trigger self-registration.
// 4. Create the Discord client with required intents.
// 5. Register event handlers.
// 6. Login and start the bot.
//

validateBootstrap();

const config = loadConfig();

// Trigger provider registration
await import("./providers/index.js");

// ── Discord Client ───────────────────────────────────────────────────
//
// GatewayIntentBits.MessageContent is a privileged intent — enable it
// in the Discord Developer Portal under Bot > Privileged Gateway Intents.
//

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ── Event Handlers ───────────────────────────────────────────────────

client.once("ready", (readyClient) => {
  logger.info("__PROJECT_NAME__ is online", {
    user: readyClient.user.tag,
    guilds: readyClient.guilds.cache.size,
    provider: config.LLM_PROVIDER,
  });
});

registerMessageCreateHandler(client, config);
registerInteractionCreateHandler(client, config);

// ── Login ────────────────────────────────────────────────────────────

await client.login(config.DISCORD_TOKEN);

// ── Graceful Shutdown ────────────────────────────────────────────────

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down...`);
  client.destroy();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
