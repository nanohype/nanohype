# a2a-agent

Scaffolds an Agent-to-Agent (A2A) protocol peer in TypeScript.

## What you get

- **A2A agent** (`src/agent.ts`): exposes skills to other agents and invokes capabilities on remote peers, using an LLM provider for reasoning about which skill to execute.
- **Skill registry** (`src/skills/`): register capabilities the agent can perform, with typed input/output schemas and a central lookup.
- **Protocol layer** (`src/protocol/`): A2A message types (Task, Artifact, Message), a client for calling remote agents, and a server for handling incoming requests.
- **Transport registry** (`src/protocol/transport/`): pluggable transports (HTTP, WebSocket) with a registry for runtime selection.
- **Agent discovery** (`src/discovery/`, optional): agent directory for discovering peers and an Agent Card served at `/.well-known/agent.json`.
- **Provider abstraction** (`src/providers/`): swap between Anthropic and OpenAI with a single config value.

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `"An A2A protocol agent"` | Short project description |
| `LlmProvider` | string | `"anthropic"` | LLM provider for agent reasoning |
| `Transport` | string | `"http"` | A2A transport (`http` or `websocket`) |
| `IncludeDiscovery` | bool | `true` | Include agent discovery and Agent Card |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/
    agent.ts                     # A2A agent — skill dispatch and remote invocation
    skills/                      # Skill registry and implementations
    protocol/                    # A2A protocol types, client, server
      transport/                 # Pluggable transports (HTTP, WebSocket)
    discovery/                   # Agent directory and Agent Card (conditional)
    providers/                   # LLM provider abstraction (Anthropic / OpenAI)
    logger.ts                    # Structured JSON logger
    __tests__/                   # Vitest test suite (conditional)
  package.json
  tsconfig.json
  eslint.config.js
  .prettierrc
  vitest.config.ts
  README.md
```

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- expose agent tools as an MCP server
- [agentic-loop](../agentic-loop/) -- standalone tool-calling agent loop
- [eval-harness](../eval-harness/) -- evaluation framework for agent behavior

## Nests inside

- [monorepo](../monorepo/)
