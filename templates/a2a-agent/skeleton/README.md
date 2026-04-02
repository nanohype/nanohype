# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project implements an **A2A protocol peer** — an agent that exposes skills to other agents and can discover and invoke capabilities on remote agents.

```
Incoming A2A request
    |
    v
+-------------------+
| A2A Server        |  <-- src/protocol/server.ts
| (transport: __TRANSPORT__) |
|                   |
|  1. Parse task    |
|  2. LLM reasoning|  <-- provider: __LLM_PROVIDER__
|  3. Select skill  |
|  4. Execute       |
|  5. Return result |
+-------------------+
    |
    v
A2A response (Artifact)
```

### Provider: __LLM_PROVIDER__

The LLM provider is configured in `src/providers/`. The active provider is set to `__LLM_PROVIDER__`. Both Anthropic and OpenAI client wrappers are included — switch by changing the provider configuration in `src/providers/index.ts`.

### Skills

Skills are the A2A equivalent of MCP tools — registered actions the agent can perform. Each skill declares its name, description, and input/output types. See `src/skills/example.ts` for the pattern.

### Adding a skill

1. Create a file in `src/skills/` — define your input/output types and implement the `execute` function.
2. Import and register it in `src/skills/registry.ts`.

The agent will automatically discover registered skills and present them to remote peers via the Agent Card.

### Transport: __TRANSPORT__

The transport layer is pluggable. The active transport is set to `__TRANSPORT__`. Both HTTP and WebSocket transports are included — switch by changing the transport configuration.

## Usage

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-..."   # or OPENAI_API_KEY for OpenAI provider

# Run the agent
npm start

# Development mode (file watching)
npm run dev

# Run tests
npm test

# Compile TypeScript
npm run build
```

## Project structure

```
src/
  agent.ts              A2A agent — skill dispatch and remote invocation
  skills/
    registry.ts         Skill registry
    types.ts            Skill interface
    example.ts          Example skill implementation
  protocol/
    types.ts            A2A protocol message types
    client.ts           A2A client — call remote agents
    server.ts           A2A server — handle incoming requests
    transport/
      types.ts          Transport interface
      registry.ts       Transport registry
      http.ts           HTTP transport
      index.ts          Barrel export
  discovery/
    registry.ts         Agent directory — discover peers
    card.ts             Agent Card (/.well-known/agent.json)
  providers/
    types.ts            LLM provider interface
    registry.ts         Provider registry
    anthropic.ts        Anthropic client wrapper
    openai.ts           OpenAI client wrapper
    index.ts            Barrel export
  logger.ts             Structured JSON logger
  __tests__/
    skills.test.ts      Skill registry tests
    protocol.test.ts    Protocol type and client tests
```
