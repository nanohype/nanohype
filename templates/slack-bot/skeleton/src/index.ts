import "dotenv/config";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { App } from "@slack/bolt";
import { registerMessageHandler } from "./events/message.js";
import { registerAppMentionHandler } from "./events/app-mention.js";

// ── Bootstrap ────────────────────────────────────────────────────────
//
// 1. Validate that all scaffolding placeholders have been replaced.
// 2. Validate configuration (exits on invalid env vars).
// 3. Import providers to trigger self-registration.
// 4. Create the Bolt app with Socket Mode or HTTP.
// 5. Register event handlers and slash commands.
// 6. Start the app.
//

validateBootstrap();

const config = loadConfig();

// Trigger provider registration
await import("./providers/index.js");

// ── Bolt App ─────────────────────────────────────────────────────────
//
// Socket Mode uses a WebSocket connection for local development —
// no public URL required. In production, disable Socket Mode and
// configure an HTTP endpoint with the signing secret for verification.
//

const app = new App({
  token: config.SLACK_BOT_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: config.SOCKET_MODE,
  appToken: config.SOCKET_MODE ? config.SLACK_APP_TOKEN : undefined,
  port: config.PORT,
});

// ── Event Handlers ───────────────────────────────────────────────────

registerMessageHandler(app, config);
registerAppMentionHandler(app, config);

// ── Slash Commands ───────────────────────────────────────────────────

try {
  const { registerAskCommand } = await import("./commands/ask.js");
  registerAskCommand(app, config);
} catch {
  // /ask command not included — conditional file
}

// ── Start ────────────────────────────────────────────────────────────

await app.start();
logger.info("__PROJECT_NAME__ is running", {
  socketMode: config.SOCKET_MODE,
  port: config.PORT,
  provider: config.LLM_PROVIDER,
});

// ── Graceful Shutdown ────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down...`);
  await app.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
