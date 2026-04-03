# agent-orchestrator

Multi-agent orchestrator with task decomposition, capability-based routing, and shared context.

## What you get

- **Orchestrator facade** (`createOrchestrator(config)`): receive a task, decompose it via a planner agent, route subtasks to specialized agents, aggregate results.
- **Planner agent**: LLM-powered agent that decomposes tasks into ordered subtasks with agent assignments and dependency declarations.
- **Capability-based routing**: routes subtasks to agents based on capability matching with keyword and capability-match strategies.
- **Shared context**: key-value store with namespacing that accumulates between subtask executions. Agents read what previous agents wrote.
- **Handoff protocol**: records agent-to-agent transitions with metadata (fromAgent, toAgent, reason) creating an audit trail.
- **LLM provider abstraction**: swap between Anthropic and OpenAI with a single config value.
- **Circuit breaker**: resilient external API access with sliding-window failure detection.

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `Multi-agent orchestrator` | Short project description |
| `LlmProvider` | string | `anthropic` | `anthropic` or `openai` |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/
    orchestrator/
      index.ts                # createOrchestrator facade
      types.ts                # Task, SubTask, AgentCapability, OrchestratorConfig, OrchestratorResult
      config.ts               # Configuration schema and defaults
      bootstrap.ts            # Placeholder validation
      logger.ts               # Structured JSON logger
      metrics.ts              # OTel counters and histograms
      orchestrator.ts         # Core orchestration loop
      agents/
        types.ts              # Agent interface
        registry.ts           # Factory-based agent registry
        planner.ts            # LLM-powered task decomposition
        researcher.ts         # Example specialized agent
        mock.ts               # Deterministic agent for testing
        index.ts              # Barrel import
      context/
        shared.ts             # SharedContext with namespacing
        handoff.ts            # HandoffProtocol audit trail
      routing/
        router.ts             # Subtask-to-agent routing
        strategies.ts         # Routing strategies
      providers/
        types.ts              # LLM provider interface
        registry.ts           # Factory-based provider registry
        anthropic.ts          # Anthropic client wrapper
        openai.ts             # OpenAI client wrapper
        mock.ts               # Deterministic mock provider
        index.ts              # Barrel import
      resilience/
        circuit-breaker.ts
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        orchestrator.test.ts
        routing.test.ts
        context.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- use as a building block for individual agents
- [mcp-server-ts](../mcp-server-ts/) -- expose orchestrator as an MCP server
- [rag-pipeline](../rag-pipeline/) -- add retrieval-augmented generation to agents

## Nests inside

- [monorepo](../monorepo/)
