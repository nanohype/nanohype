# discord-bot

TypeScript Discord bot with discord.js v14, AI-powered responses, and a pluggable LLM provider registry.

## What you get

- **discord.js v14** client with GatewayIntentBits for guilds, messages, and message content
- **Slash command** `/ask` with Discord API registration script
- **AI message handler** responds to DMs and mentions with LLM-generated replies
- **Embed responses** rich formatting with Discord embeds for structured AI output
- **Provider registry** pluggable LLM backend: `gateway` (the default), which calls the Platform's ModelGateway and holds no model credential, and `anthropic` / `openai` key providers behind `IncludeKeyProviders`, for use off the substrate only
- **Structured logging** with level-filtered JSON output

## Variables

| Variable              | Type   | Default                   | Description                                                                                                                                                                  |
| --------------------- | ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectName`         | string | _(required)_              | Kebab-case project name                                                                                                                                                      |
| `Description`         | string | `"A Discord bot with AI"` | Short project description                                                                                                                                                    |
| `LlmProvider`         | string | `"gateway"`               | `gateway`, or `anthropic` / `openai` with `IncludeKeyProviders`                                                                                                              |
| `PlatformName`        | string | `ProjectName`             | Platform CR the bot deploys under; sets the gateway's default endpoint                                                                                                       |
| `IncludeTests`        | bool   | `true`                    | Include test files                                                                                                                                                           |
| `IncludeKeyProviders` | bool   | `false`                   | Include the API-key providers, for use off the substrate only                                                                                                                |
| `ProviderCheck`       | string | derived                   | Derived from `LlmProvider` and the Include variables; fails the scaffold when `LlmProvider` names a provider the project leaves out. The scaffold rejects a value set for it |

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
      anthropic.ts        # Anthropic provider (IncludeKeyProviders)
      openai.ts           # OpenAI provider (IncludeKeyProviders)
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
