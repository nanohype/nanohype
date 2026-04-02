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

The LLM provider is configured in `src/providers/`. The active provider is set to `__LLM_PROVIDER__`. Both Anthropic and OpenAI client wrappers are included — switch by changing the provider configuration in `src/providers/index.ts`.

### Tool Registry

Tools are defined with Zod schemas for input validation and registered in a central registry. See `src/tools/example.ts` for the pattern.

### Adding a tool

1. Create a file in `src/tools/` — define your Zod input schema, write an `execute` function, and export a `Tool` object.
2. Import and register it in `src/tools/index.ts`.

The agent will automatically discover registered tools and present them to the LLM.

## Usage

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-..."   # or OPENAI_API_KEY for OpenAI provider

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
    anthropic.ts        Anthropic client wrapper
    openai.ts           OpenAI client wrapper
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
