# __PROJECT_NAME__

__DESCRIPTION__

A Slack bot built with [@slack/bolt](https://slack.dev/bolt-js) and AI-powered responses via a pluggable LLM provider registry.

## What You Get

- **@slack/bolt** app with Socket Mode for local dev and HTTP for production
- **AI message handler** responds to DMs with context-aware LLM replies
- **App mention handler** responds when @mentioned in channels
- **Thread-aware context** maintains conversation history per thread
- **/ask slash command** for on-demand AI queries
- **Provider registry** with `gateway` as the default: it calls the Platform's ModelGateway, the path to a model on the nanohype substrate, and holds no model credential. `bedrock` calls Bedrock directly for a bot off the substrate

## Variables

| Variable | Description | Default |
|---|---|---|
| `ProjectName` | Kebab-case project name | _(required)_ |
| `Description` | Short project description | A Slack bot with AI |
| `LlmProvider` | LLM provider | gateway |
| `PlatformName` | Platform CR the bot deploys under | ProjectName |
| `IncludeSlashCommands` | Include /ask slash command | true |
| `IncludeTests` | Include test files | true |

## Getting Started

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add these bot scopes:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
   - `commands` (if using slash commands)
3. Install the app to your workspace
4. Under **Socket Mode**, enable it and create an app-level token with `connections:write`
5. Under **Event Subscriptions**, subscribe to:
   - `message.im`
   - `app_mention`

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your Slack tokens
```

### 3. Run

```bash
npm install
npm run dev
```

The `gateway` provider calls the Platform's ModelGateway at `MODEL_GATEWAY_ENDPOINT`, by default the Service the eks-agent-platform operator creates for the Platform named at scaffold time, and sends no credential. Off the cluster, the default endpoint is a cluster-internal Service address. Forward the gateway Service to this machine, which the Kubernetes API server authorizes as the user who opens the forward (`create` on `pods/portforward` in the Platform's namespace), and point `MODEL_GATEWAY_ENDPOINT` at it:

```bash
kubectl -n tenants-__PLATFORM_NAME__ port-forward svc/__PLATFORM_NAME__-gateway 8080:8080
MODEL_GATEWAY_ENDPOINT=http://localhost:8080 npm run dev
```

## Project Layout

```
src/
  index.ts                  # Entrypoint — Bolt app, Socket Mode / HTTP
  config.ts                 # Zod-validated environment config
  logger.ts                 # Structured JSON logger
  bootstrap.ts              # Placeholder validation guard
  events/
    message.ts              # DM message handler with AI + thread context
    app-mention.ts          # @mention handler with AI
  commands/
    ask.ts                  # /ask slash command (conditional)
  providers/
    types.ts                # LlmProvider interface
    registry.ts             # Provider registry (register/get/list)
    gateway.ts              # Platform ModelGateway provider, self-registers
    bedrock.ts              # Bedrock provider, off the substrate
    index.ts                # Barrel — triggers registration
```

## Adding Event Handlers

1. Create a new file in `src/events/` following the pattern in `message.ts`
2. Export a `register*Handler(app, config)` function
3. Call it from `src/index.ts`

## Adding Slash Commands

1. Create a new file in `src/commands/` following the pattern in `ask.ts`
2. Register the command in your Slack app configuration
3. Import and register the handler in `src/index.ts`

## Architecture

- **Socket Mode for development** — no public URL or tunneling needed. The bot connects via WebSocket. For production, disable Socket Mode and expose an HTTP endpoint.
- **Thread-aware context** — the message handler maintains a bounded conversation history (20 messages) per Slack thread, so the LLM produces contextual multi-turn responses.
- **Provider registry pattern** — each provider self-registers on import. Switch providers by changing `LLM_PROVIDER` in your environment. Add new providers by creating a file that implements `LlmProvider` and calls `registerProvider()`.
- **Graceful shutdown** — SIGTERM/SIGINT cleanly disconnect the bot.
- **Bootstrap guard** detects unresolved `__PLACEHOLDER__` patterns left from incomplete scaffolding and halts the process with a diagnostic message.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Disable Socket Mode (`SOCKET_MODE=false`) and configure HTTP endpoint
- [ ] Set `SLACK_SIGNING_SECRET` for request verification
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Configure slash commands in Slack app settings
- [ ] Set up health monitoring and alerting

## Pairs With

- **module-queue-ts** — Background job processing for long-running AI tasks
- **module-database-ts** — Persistent conversation history and user preferences
- **agentic-loop** — Tool-calling agent capabilities for the bot

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
