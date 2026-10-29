# discord-bot

TypeScript Discord bot with discord.js v14, AI-powered responses, and a pluggable LLM provider registry.

## What you get

- **discord.js v14** client with GatewayIntentBits for guilds, messages, and message content
- **Slash command** `/ask` with Discord API registration script
- **AI message handler** responds to DMs and mentions with LLM-generated replies
- **Embed responses** rich formatting with Discord embeds for structured AI output
- **Provider registry** pluggable LLM backend: `gateway` (the default), which calls the Platform's ModelGateway and holds no model credential, beside a deterministic `mock`
- **Structured logging** with level-filtered JSON output

## Variables

| Variable       | Type   | Default                   | Description                                                            |
| -------------- | ------ | ------------------------- | ---------------------------------------------------------------------- |
| `ProjectName`  | string | _(required)_              | Kebab-case project name                                                |
| `Description`  | string | `"A Discord bot with AI"` | Short project description                                              |
| `LlmProvider`  | string | `"gateway"`               | `gateway`, or a custom provider registered in `src/providers/`         |
| `PlatformName` | string | `${ProjectName}`          | Platform CR the bot deploys under; sets the gateway's default endpoint |
| `IncludeTests` | bool   | `true`                    | Include test files                                                     |

## Project layout

```text
<ProjectName>/
  src/
    index.ts              # Entrypoint — Client setup + event listeners
    config.ts             # Zod-validated environment config
    logger.ts             # Structured JSON logger
    bootstrap.ts          # Placeholder validation guard
    events/
      message-create.ts   # Message handler with AI
      interaction-create.ts # Slash command interaction handler
    commands/
      deploy.ts           # Register commands with Discord API
      ask.ts              # /ask command definition and handler
    providers/
      types.ts            # LlmProvider interface
      registry.ts         # Provider registry (register/get/list)
      gateway.ts          # Platform ModelGateway provider, no credential
      index.ts            # Barrel — triggers registration
  package.json
  tsconfig.json
  .env.example
  README.md
```

## Pairs with

- [module-queue-ts](../module-queue-ts/) -- background job processing
- [module-database-ts](../module-database-ts/) -- persistent storage
- [agentic-loop](../agentic-loop/) -- tool-calling agent capabilities

## Nests inside

- [monorepo](../monorepo/)
