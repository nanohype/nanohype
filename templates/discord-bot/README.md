# discord-bot

TypeScript Discord bot with discord.js v14, AI-powered responses, and a pluggable LLM provider registry.

## What you get

- **discord.js v14** client with GatewayIntentBits for guilds, messages, and message content
- **Slash command** `/ask` with Discord API registration script
- **AI message handler** responds to DMs and mentions with LLM-generated replies
- **Embed responses** rich formatting with Discord embeds for structured AI output
- **Provider registry** pluggable LLM backend (Anthropic, OpenAI)
- **Structured logging** with level-filtered JSON output

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `"A Discord bot with AI"` | Short project description |
| `LlmProvider` | string | `"anthropic"` | `anthropic` or `openai` |
| `IncludeTests` | bool | `true` | Include test files |

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
      anthropic.ts        # Anthropic provider, self-registers
      openai.ts           # OpenAI provider, self-registers
      index.ts            # Barrel — triggers registration
  package.json
  tsconfig.json
  .env.example
  README.md
```

## Pairs with

- [module-queue](../module-queue/) -- background job processing
- [module-database](../module-database/) -- persistent storage
- [agentic-loop](../agentic-loop/) -- tool-calling agent capabilities

## Nests inside

- [monorepo](../monorepo/)
