# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project implements an **agentic loop** — the core pattern behind tool-calling AI agents.

```
User input
    |
    v
+-------------------+
| Agent Loop        |  <-- src/agent.ts
| (max __MAX_ITERATIONS__ iterations) |
|                   |
|  1. Send to LLM   |
|  2. Check for     |
|     tool calls    |
|  3. Execute tools |
|  4. Append result |
|  5. Repeat        |
+-------------------+
    |
    v
Final response
```

### Provider: __LLM_PROVIDER__

The LLM provider is configured in `src/providers/`. The active provider is set to `__LLM_PROVIDER__`. The `gateway` provider calls the Platform's ModelGateway, the only route to a model on the nanohype substrate: the eks-agent-platform operator runs it under the tenant's EKS Pod Identity, holding the Bedrock role, so the agent holds no model credential and sends none. It speaks native Anthropic Messages with tool use, and hands every reply block, thinking included, back on the next turn. `MODEL_GATEWAY_ENDPOINT` is the gateway root, as ModelGateway `status.endpoint` publishes it, and defaults to the Service the operator creates for the Platform named at scaffold time; `MODEL_ROUTE` (`default`) names the route the ModelGateway maps to a Bedrock model. A project scaffolded with `IncludeKeyProviders` also carries the Anthropic and OpenAI client wrappers, which the LLM policy permits only off the substrate, for a provider the intake brief names, with the key read from the environment or the OS keychain.

### Tool Registry

Tools are defined with Zod schemas for input validation and registered in a central registry. See `src/tools/example.ts` for the pattern.

### Adding a tool

1. Create a file in `src/tools/` — define your Zod input schema, write an `execute` function, and export a `Tool` object.
2. Import and register it in `src/tools/index.ts`.

The agent will automatically discover registered tools and present them to the LLM.

### Design Decisions

- **Iteration-capped loop** -- the agent runs up to `__MAX_ITERATIONS__` send-check-execute cycles, preventing runaway tool-call chains. If the limit is reached, whatever text the LLM produced so far is returned.
- **Provider abstraction** (`LlmProvider` interface) -- Anthropic and OpenAI use different message shapes (content blocks vs. tool_calls arrays). The provider normalizes both into a shared `LlmResponse` with `content`, `toolCalls`, and `rawAssistantMessage` fields, so the loop itself is provider-agnostic.
- **Tool registry with Zod validation** -- each tool declares a Zod schema for its inputs. The registry validates inputs before execution and formats tools for the LLM's function-calling API. Adding a tool is one file + one import.
- **Streaming and non-streaming paths** -- `runAgent()` returns a complete `AgentResult`; `runStream()` yields `StreamEvent` objects (text chunks, tool calls, tool results) as an async generator. Both share the same loop logic.
- **Conversation persistence** -- an optional `ConversationStore` loads prior messages before the loop and saves updated history after completion, enabling multi-turn conversations across invocations.
- **Token-aware context management** -- `MessageStore` estimates token counts via a BPE tokenizer and truncates oldest messages to stay within a budget, preserving the most recent conversation context.
- **Error isolation per tool** -- tool execution failures are caught individually and sent back to the LLM as error messages rather than crashing the loop, allowing the agent to recover or try a different approach.

## Production Readiness

- [ ] Declare the route the agent names (`MODEL_ROUTE`, `default` when unset) in the Platform's ModelGateway
- [ ] Set `MAX_ITERATIONS` to an appropriate limit for your use case
- [ ] Review tool permissions -- each tool should have minimal access
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Add rate limiting on API calls to the LLM provider
- [ ] Instrument with tracing to monitor iteration counts and tool call patterns
- [ ] Set a token budget for `MessageStore` to bound memory and API costs
- [ ] Run eval suite (`npm run eval`) to validate tool-calling accuracy before deploy

## Usage

```bash
# Run the agent
npm start

# Development mode (file watching)
npm run dev

# Run eval suite
npm run eval

# Compile TypeScript
npm run build
```

## Project structure

```
src/
  agent.ts              Core agentic loop
  providers/
    index.ts            Active provider export
    gateway.ts          Platform ModelGateway provider, no credential
    messages-tools.ts   Messages API tool definitions
  tools/
    index.ts            Tool registry with registered tools
    registry.ts         Tool type definitions and registry class
    example.ts          Example tool implementation
  memory/
    store.ts            Conversation message store
    context.ts          Context window management
  eval/
    runner.ts           Eval runner — loads fixtures, runs agent, reports
    assertions.ts       Assertion helpers for eval
    fixtures/           Test fixture files (.json)
```
