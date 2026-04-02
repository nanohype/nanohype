# guardrails

Input/output safety filters for AI systems.

## What you get

- **Filter registry** — plug in prompt-injection, PII, content-policy, token-limit, or your own
- **Filter pipeline** — chains multiple filters, short-circuits on block, collects all violations
- **Four built-in filters** — prompt injection detection, PII redaction, content policy, token limits
- **Bidirectional filtering** — inspect both user input and LLM output

## Variables

| Variable | Placeholder | Default | Description |
|----------|-------------|---------|-------------|
| `ProjectName` | `__PROJECT_NAME__` | *(required)* | Kebab-case package name |
| `Description` | `__DESCRIPTION__` | AI safety guardrails | Package description |
| `IncludePii` | `__INCLUDE_PII__` | `true` | Include PII detection filter |
| `IncludeContentPolicy` | `__INCLUDE_CONTENT_POLICY__` | `true` | Include content policy filter |
| `IncludeTests` | `__INCLUDE_TESTS__` | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/
    guardrails/
      index.ts              # Main export — createGuardrail(config)
      types.ts              # FilterResult, GuardrailConfig, Violation
      pipeline.ts           # Filter pipeline — chains multiple filters
      filters/
        types.ts            # Filter interface
        registry.ts         # Filter registry
        prompt-injection.ts # Prompt injection detection
        pii.ts              # PII detection and redaction (conditional)
        content-policy.ts   # Content policy enforcement (conditional)
        token-limit.ts      # Token/length limit guard
        index.ts            # Barrel import + re-exports
        __tests__/          # (conditional on IncludeTests)
          pipeline.test.ts
          prompt-injection.test.ts
          pii.test.ts
    logger.ts               # Structured JSON logger
  package.json
  tsconfig.json
  eslint.config.js
  .prettierrc
  vitest.config.ts
```

## Pairs with

- [agentic-loop](../agentic-loop/) -- add safety filters to an agentic loop
- [mcp-server-ts](../mcp-server-ts/) -- filter MCP server tool inputs and outputs
- [ts-service](../ts-service/) -- add guardrails middleware to a TypeScript HTTP service
- [rag-pipeline](../rag-pipeline/) -- filter RAG pipeline inputs and retrieved content

## Nests inside

- [monorepo](../monorepo/)
