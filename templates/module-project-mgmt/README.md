# module-project-mgmt

Project management integration with pluggable providers.

## What you get

- Factory-based provider registry with no module-level mutable state
- Linear provider (GraphQL, native fetch, lazy init, circuit breaker)
- Jira provider (REST v3, basic auth, ADF format handling, circuit breaker)
- Asana provider (REST, bearer token, section-to-sprint mapping, circuit breaker)
- Shortcut provider (REST, token auth, workflow state mapping, circuit breaker)
- Mock provider with in-memory storage and deterministic IDs (always included)
- Unified `Priority` enum: urgent, high, medium, low, none -- each provider maps its native priorities
- Cursor-based pagination via `PaginatedResult<T>`
- OTel metrics: request totals, duration
- Per-instance circuit breakers for fault isolation
- All providers use native `fetch` -- no SDK dependencies beyond zod and @opentelemetry/api

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Project management integration with pluggable providers` | Project description |
| `Provider` | string | `linear` | Default project management provider |

## Project layout

```text
<ProjectName>/
  src/
    project-mgmt/
      index.ts                  # createProjectClient(config) facade
      types.ts                  # Project, Issue, Sprint, Comment, Label, Priority, etc.
      config.ts                 # Zod validated config
      bootstrap.ts              # Unresolved placeholder detection
      logger.ts                 # Structured logger
      metrics.ts                # OTel metrics
      providers/
        types.ts                # ProjectProvider interface (canonical)
        registry.ts             # Factory-based registry
        linear.ts               # Linear API (GraphQL, native fetch)
        jira.ts                 # Jira REST v3 API (basic auth)
        asana.ts                # Asana REST API (bearer token)
        shortcut.ts             # Shortcut REST API (token auth)
        mock.ts                 # In-memory with deterministic IDs
        index.ts                # Barrel with self-registration
      resilience/
        circuit-breaker.ts      # Sliding-window circuit breaker
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts            # CRUD, pagination, priority mapping
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add project management to a service
- [module-webhook](../module-webhook/) -- receive project management webhooks
- [module-queue](../module-queue/) -- queue project management operations

## Nests inside

- [monorepo](../monorepo/)
