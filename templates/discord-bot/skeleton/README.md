# __PROJECT_NAME__

__DESCRIPTION__

A Discord bot built with [discord.js](https://discord.js.org) v14 and AI-powered responses via a pluggable LLM provider registry.

## What You Get

- **discord.js v14** client with gateway intents for guilds, messages, and DMs
- **Slash command** `/ask` for on-demand AI queries with embed responses
- **AI message handler** responds to DMs and @mentions
- **Conversation context** maintains history per channel for multi-turn AI
- **Embed formatting** rich responses using Discord embeds for long answers
- **Provider registry** swap between Anthropic and OpenAI with a config value

## Variables

| Variable | Description | Default |
|---|---|---|
| `ProjectName` | Kebab-case project name | _(required)_ |
| `Description` | Short project description | A Discord bot with AI |
| `LlmProvider` | LLM provider | anthropic |
| `IncludeTests` | Include test files | true |

## Getting Started

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application
2. Under **Bot**, click "Add Bot"
3. Enable **Message Content Intent** under Privileged Gateway Intents
4. Copy the bot token
5. Under **OAuth2 > URL Generator**, select `bot` and `applications.commands` scopes
6. Select permissions: Send Messages, Read Messages/View Channels, Embed Links, Use Slash Commands
7. Use the generated URL to invite the bot to your server

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, and API keys
```

### 3. Register Slash Commands

```bash
npm run deploy-commands
```

### 4. Run

```bash
npm install
npm run dev
```

## Project Layout

```
src/
  index.ts                  # Entrypoint — Client setup + event listeners
  config.ts                 # Zod-validated environment config
  logger.ts                 # Structured JSON logger
  bootstrap.ts              # Placeholder validation guard
  events/
    message-create.ts       # DM and mention handler with AI + context
    interaction-create.ts   # Slash command interaction dispatcher
  commands/
    deploy.ts               # Register commands with Discord API
    ask.ts                  # /ask command definition and handler
  providers/
    types.ts                # LlmProvider interface
    registry.ts             # Provider registry (register/get/list)
    anthropic.ts            # Anthropic provider, self-registers
    openai.ts               # OpenAI provider, self-registers
    index.ts                # Barrel — triggers registration
```

## Adding Commands

1. Create a new file in `src/commands/` following the pattern in `ask.ts`
2. Export a `SlashCommandBuilder` definition and a handler function
3. Add the command JSON to the `commands` array in `src/commands/deploy.ts`
4. Add a case in `src/events/interaction-create.ts`
5. Run `npm run deploy-commands` to register with Discord

## Architecture

- **Gateway intents** — the bot subscribes to `Guilds`, `GuildMessages`, `MessageContent`, and `DirectMessages`. `MessageContent` is a privileged intent that must be enabled in the Developer Portal.
- **Conversation context** — the message handler maintains a bounded history (20 messages) per channel, so the LLM produces contextual multi-turn responses.
- **Embed responses** — long responses (>500 chars) are wrapped in Discord embeds for cleaner formatting. Commands always use embeds.
- **Provider registry pattern** — each provider self-registers on import. Switch providers by changing `LLM_PROVIDER` in your environment. Add new providers by creating a file that implements `LlmProvider` and calls `registerProvider()`.
- **Deferred replies** — slash commands defer their reply before calling the LLM, so Discord doesn't time out the 3-second interaction window.
- **Graceful shutdown** — SIGTERM/SIGINT destroy the client connection cleanly.
- **Bootstrap guard** detects unresolved `__PLACEHOLDER__` patterns left from incomplete scaffolding and halts the process with a diagnostic message.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Run `npm run deploy-commands` to register slash commands
- [ ] Enable Message Content Intent in Discord Developer Portal
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Set up process manager (PM2, systemd, or container orchestration)
- [ ] Configure health monitoring and alerting

## Pairs With

- **module-queue-ts** — Background job processing for long-running AI tasks
- **module-database-ts** — Persistent conversation history and user preferences
- **agentic-loop** — Tool-calling agent capabilities for the bot

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
