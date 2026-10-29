# slack-bot

TypeScript Slack bot with @slack/bolt, AI-powered responses, and a pluggable LLM provider registry.

## What you get

- **@slack/bolt** app with Socket Mode (dev) and HTTP (production)
- **AI message handler** responds to DMs and mentions with LLM-generated replies
- **Thread-aware context** maintains conversation history per thread for multi-turn AI
- **Slash command** `/ask` for on-demand AI queries (conditional)
- **Provider registry** pluggable LLM backend: `gateway` (the default), which calls the Platform's ModelGateway and holds no model credential, a direct `bedrock` provider for use off the substrate, and `anthropic` / `openai` key providers behind `IncludeKeyProviders`, also off the substrate only
- **Structured logging** with level-filtered JSON output

## Variables

| Variable               | Type   | Default                 | Description                                                                |
| ---------------------- | ------ | ----------------------- | -------------------------------------------------------------------------- |
| `ProjectName`          | string | _(required)_            | Kebab-case project name                                                    |
| `Description`          | string | `"A Slack bot with AI"` | Short project description                                                  |
| `LlmProvider`          | string | `"gateway"`             | `gateway`, `bedrock`, or `anthropic` / `openai` with `IncludeKeyProviders` |
| `PlatformName`         | string | `ProjectName`           | Platform CR the bot deploys under; sets the gateway's default endpoint     |
| `IncludeSlashCommands` | bool   | `true`                  | Include `/ask` slash command                                               |
| `IncludeTests`         | bool   | `true`                  | Include test files                                                         |
| `IncludeKeyProviders`  | bool   | `false`                 | Include the API-key providers, for use off the substrate only              |
| `ProviderCheck` | string | derived | Derived from `LlmProvider` and the Include variables; fails the scaffold when `LlmProvider` names a provider the project leaves out. Leave it unset |

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
