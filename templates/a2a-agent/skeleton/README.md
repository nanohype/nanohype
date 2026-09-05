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

### Routing

`src/routing.ts` turns an incoming task into a routing decision: the name of a registered skill, or none. The model's reply is validated before it becomes one. A reply that is not a decision is refused, and a decision naming a skill the registry does not hold is reported as no route — so a task is never dispatched to a name the registry cannot run.

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

# Run the eval suite against the live model
npm run eval

# Compile TypeScript
npm run build
```

## Evaluating the router

The routing decision is the product of this agent and it comes from a model, so it carries an eval suite rather than a demo. `src/eval/cases/` holds one case per file: golden cases for the routes the agent exists to make, adversarial cases for tasks trying to make it route somewhere else — a skill name planted in the task text, a task no skill covers, a request to put the system prompt or a key into the rationale that every decision is logged with.

The corpus loader refuses an empty corpus, and refuses a malformed case instead of skipping it: an eval that runs nothing exits the same way as one that ran the whole corpus and passed, and a case that is skipped stops running with nothing saying so. `npm test` covers the loader and the assertion helpers without a network or a provider key; the eval itself calls the model and is run on demand.

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
  routing.ts            Task -> skill decision, validated before it is one
  eval/
    runner.ts           Eval runner -- routes each case, reports assertions
    assertions.ts       Assertion helpers over a routing outcome
    cases.ts            Corpus loader -- refuses an empty or malformed corpus
    cases/              One case per file (.json)
  logger.ts             Structured JSON logger
  __tests__/
    skills.test.ts      Skill registry tests
    protocol.test.ts    Protocol type and client tests
    routing.test.ts     Routing prompt and reply validation
    eval-cases.test.ts  Corpus loader tests
    eval-assertions.test.ts  Eval assertion helper tests
```
