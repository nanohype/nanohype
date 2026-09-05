# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project implements a **multi-agent orchestrator** that decomposes tasks, routes subtasks to specialized agents, and aggregates results.

```
Task input
    |
    v
+-------------------+
| Planner Agent     |  <-- LLM-powered task decomposition
| (via __LLM_PROVIDER__)       |
|                   |
|  Returns ordered  |
|  subtask list     |
+-------------------+
    |
    v
+-------------------+
| Router            |  <-- Capability + keyword matching
|                   |
|  Maps subtasks    |
|  to agents        |
+-------------------+
    |
    v
+-------------------+
| Agent Execution   |  <-- Sequential, dependency-ordered
|                   |
|  Shared context   |
|  accumulates      |
|  between agents   |
+-------------------+
    |
    v
OrchestratorResult
```

### Provider: __LLM_PROVIDER__

The LLM provider is configured in `src/orchestrator/providers/`. The active provider is set to `__LLM_PROVIDER__`. Both Anthropic and OpenAI wrappers are included — switch by changing the provider name in config.

### Adding an Agent

1. Create a file in `src/orchestrator/agents/` (use `researcher.ts` as a reference).
2. Implement the `Agent` interface with `name`, `capabilities`, and `execute`.
3. Call `registerAgent()` at the end of the file.
4. Import the file in `src/orchestrator/agents/index.ts`.

The orchestrator automatically discovers registered agents and makes them available for routing.

### Design Decisions

- **Factory-based registries** -- agents, providers, and stores use factory functions. No module-level mutable instances — each `getAgent()` / `getProvider()` call produces a fresh instance.
- **Planner-router separation** -- the planner decomposes tasks using LLM reasoning, but the router validates assignments against the actual registry. If the planner names an agent that doesn't exist, the router falls back to capability matching.
- **Topological subtask ordering** -- subtasks declare dependencies. The orchestrator sorts them topologically and skips downstream subtasks when a dependency fails.
- **Scoped shared context** -- each agent gets a scoped view that reads from global + its own namespace. Writes go to both, so downstream agents see upstream results.
- **Handoff audit trail** -- every agent-to-agent transition is recorded with sender, receiver, reason, and timestamp. The trail is available on the result for debugging and observability.
- **Circuit breaker on LLM calls** -- provider calls are wrapped in a circuit breaker that opens after repeated failures, preventing cascading timeouts.

## Production Readiness

- [ ] Set API key environment variable (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)
- [ ] Configure `maxSubtasks` and `timeoutMs` for your workload
- [ ] Register domain-specific agents beyond the built-in researcher
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor orchestration metrics via OTel (task count, agent latency, handoff count)
- [ ] Add retry logic for transient agent failures
- [ ] Validate planner output against your domain constraints
- [ ] Run the eval suite (`npm run eval`) against the configured provider before deploy, and add cases for the goals your domain actually sends

## Usage

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-..."   # or OPENAI_API_KEY for OpenAI provider

# Development mode (file watching)
npm run dev

# Compile TypeScript
npm run build

# Run tests
npm test

# Run the eval suite against the configured provider
npm run eval
```

```typescript
import { createOrchestrator } from "./orchestrator/index.js";

const orchestrator = createOrchestrator({
  providerName: "__LLM_PROVIDER__",
  maxSubtasks: 10,
  timeoutMs: 300_000,
});

const result = await orchestrator.execute({
  id: "task-1",
  description: "Research AI agent architectures and summarize findings",
});

console.log("Success:", result.success);
console.log("Subtasks:", result.subtasks.length);
console.log("Reasoning:", result.reasoning);

for (const [subtaskId, agentResult] of result.results) {
  console.log(`${subtaskId}: ${agentResult.success ? "OK" : "FAILED"}`);
}
```

## Project structure

```
src/
  orchestrator/
    index.ts              createOrchestrator facade
    orchestrator.ts       Core orchestration loop
    types.ts              Shared type definitions
    agents/
      index.ts            Agent barrel (triggers registration)
      registry.ts         Factory-based agent registry
      planner.ts          LLM-powered task decomposition
      researcher.ts       Example specialized agent
      mock.ts             Deterministic test agent
    context/
      shared.ts           Key-value store with namespacing
      handoff.ts          Agent-to-agent transition audit trail
    routing/
      router.ts           Subtask-to-agent routing
      strategies.ts       Keyword-match, capability-match
    providers/
      index.ts            Provider barrel
      anthropic.ts        Anthropic client wrapper
      openai.ts           OpenAI client wrapper
      mock.ts             Deterministic mock provider
    resilience/
      circuit-breaker.ts  Sliding-window failure detection
    eval/
      runner.ts           Sends each case through the orchestrator, checks the plan
      cases.ts            Corpus loader — refuses an empty or malformed corpus
      assertions.ts       Checks a plan for size, ordering and content
      cases/              One case per file, golden and adversarial
```

### Evals

`npm run eval` is a live run against the configured provider, so it costs
tokens and needs a key — a command you choose to run. `npm test` reaches no
provider. Cases are JSON, one per file under `src/orchestrator/eval/cases/`,
and each declares a `kind`:

- **golden** — the decomposition the orchestrator exists to produce, asserted
  specifically: how many steps, whether the order is declared, what the plan
  has to mention.
- **adversarial** — goal text trying to make it do something else: arguing the
  subtask cap upward, or demanding the planner drop its instructions and
  answer in prose.

The loader refuses a corpus with nothing in it and refuses a case it cannot
read, because an eval that runs nothing exits the same way as an eval that ran
everything and passed. Set `EVAL_PROVIDER` to run against a provider other
than the configured one.
