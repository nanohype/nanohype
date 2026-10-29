# slack-bot

TypeScript Slack bot with @slack/bolt, AI-powered responses, and a pluggable LLM provider registry.

## What you get

- **@slack/bolt** app with Socket Mode (dev) and HTTP (production)
- **AI message handler** responds to DMs and mentions with LLM-generated replies
- **Thread-aware context** maintains conversation history per thread for multi-turn AI
- **Slash command** `/ask` for on-demand AI queries (conditional)
- **Provider registry** pluggable LLM backend: `gateway` (the default), which calls the Platform's ModelGateway and holds no model credential, and a direct `bedrock` provider under the AWS credential chain for use off the substrate; no provider holds a provider key
- **Structured logging** with level-filtered JSON output

## Variables

| Variable               | Type   | Default                 | Description                                                            |
| ---------------------- | ------ | ----------------------- | ---------------------------------------------------------------------- |
| `ProjectName`          | string | _(required)_            | Kebab-case project name                                                |
| `Description`          | string | `"A Slack bot with AI"` | Short project description                                              |
| `LlmProvider`          | string | `"gateway"`             | `gateway` on the substrate, `bedrock` off it, `mock`, or a custom name |
| `PlatformName`         | string | `ProjectName`           | Platform CR the bot deploys under; sets the gateway's default endpoint |
| `IncludeSlashCommands` | bool   | `true`                  | Include `/ask` slash command                                           |
| `IncludeTests`         | bool   | `true`                  | Include test files                                                     |

## Project layout

```text
<ProjectName>/
  src/
    index.ts              # Entrypoint — Bolt app, Socket Mode / HTTP
    config.ts             # Zod-validated environment config
    logger.ts             # Structured JSON logger
    bootstrap.ts          # Placeholder validation guard
    events/
      message.ts          # Message event handler with AI
      app-mention.ts      # App mention handler with AI
    commands/
      ask.ts              # /ask slash command (conditional)
    providers/
      types.ts            # LlmProvider interface
      registry.ts         # Provider registry (register/get/list)
      gateway.ts          # Platform ModelGateway provider, no credential
      bedrock.ts          # Bedrock provider, off the substrate
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
