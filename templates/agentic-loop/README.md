# agentic-loop

Scaffolds a TypeScript agentic loop — the core pattern behind tool-calling AI agents.

## What you get

- **Agent loop** (`src/agent.ts`): send a message to an LLM, detect tool-call requests, execute them through a typed registry, append results, repeat until done or an iteration limit is reached.
- **Provider abstraction** (`src/providers/`): swap between Anthropic and OpenAI with a single config value.
- **Tool registry** (`src/tools/`): Zod-validated tool definitions with a registry that handles lookup and execution.
- **Memory subsystem** (`src/memory/`, optional): conversation message store with token-aware truncation and context window assembly.
- **Eval harness** (`src/eval/`, optional): fixture-based testing with assertion helpers for validating agent behavior.

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `"An agentic loop powered by LLM tool-calling"` | Short project description |
| `LlmProvider` | string | `"anthropic"` | `anthropic` or `openai` |
| `IncludeMemory` | bool | `true` | Include memory subsystem |
| `IncludeEval` | bool | `true` | Include eval harness |
| `MaxIterations` | int | `10` | Max tool-calling loop iterations |

## Project layout

```text
<ProjectName>/
  src/
    agent.ts                     # Core agentic loop
    providers/                   # LLM provider abstraction (Anthropic / OpenAI)
    tools/                       # Zod-validated tool definitions and registry
    memory/                      # Conversation store with token-aware truncation (conditional)
    eval/                        # Fixture-based eval harness (conditional)
  package.json
  tsconfig.json
  README.md
```

## After scaffolding

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-..."   # or OPENAI_API_KEY for OpenAI

# Run the agent
npm start

# Development mode with watch
npm run dev

# Run evals (if included)
npm run eval

# Build
npm run build
```

## Adding tools

1. Create a new file in `src/tools/` (use `example.ts` as a reference).
2. Define your input schema with Zod.
3. Export a `Tool` object with `name`, `description`, `inputSchema`, and `execute`.
4. Register it in `src/tools/index.ts`.

## Pairs with

- [mcp-server-ts](../mcp-server-ts/) -- expose your tools as an MCP server
- [eval-harness](../eval-harness/) -- extended evaluation framework
- [rag-pipeline](../rag-pipeline/) -- add retrieval-augmented generation to your agent

## Nests inside

- [monorepo](../monorepo/)
