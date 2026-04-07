# eval-harness

Standalone TypeScript evaluation framework for testing LLM outputs. Define eval suites in YAML, run them against Anthropic or OpenAI, and get structured pass/fail reports.

## What you get

- Core eval runner with YAML-based suite definitions
- Composable assertion library: string matching, regex, JSON Schema, token limits, custom predicates
- Console reporter (color-coded) and JSON reporter (CI-friendly)
- Anthropic and OpenAI provider wrappers
- CLI entrypoint with suite glob, concurrency, and reporter selection
- Optional GitHub Actions workflow for running evals on PRs

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | `my-evals` | Kebab-case project name |
| `Description` | string | `LLM evaluation harness` | Project description |
| `LlmProvider` | string | `anthropic` | Default provider: anthropic or openai |
| `IncludeCi` | bool | `true` | Include GitHub Actions eval workflow |

## Project layout

```text
<ProjectName>/
  src/
    runner.ts              # Core eval orchestrator
    suite.ts               # EvalSuite class (loads from YAML)
    case.ts                # EvalCase with Zod schemas
    assertions.ts          # Assertion registry and built-ins
    reporters/
      console.ts           # Terminal output
      json.ts              # Structured JSON output
    providers/
      anthropic.ts         # Anthropic wrapper
      openai.ts            # OpenAI wrapper
      index.ts             # Provider factory
  suites/
    example.yaml           # Example eval suite
  bin/
    run-evals.ts           # CLI entrypoint
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- evaluate agent behavior
- [rag-pipeline](../rag-pipeline/) -- evaluate retrieval and generation quality
- [mcp-server-ts](../mcp-server-ts/) -- evaluate tool server responses

## Nests inside

- [monorepo](../monorepo/)
