# module-feature-flags

Composable feature flags with pluggable stores and AI variant tracking.

## What you get

- Factory-based flag service via `createFlagService(config)`
- Evaluation engine with percentage rollout (deterministic userId hashing), user allowlists, and property matching
- Pluggable flag store registry with self-registering backends
- In-memory store for development and testing
- Redis store for distributed flag state via ioredis
- JSON file store for file-based configuration
- Mock store with deterministic values for testing
- Variant tracker for recording flag evaluations and pairing with observability
- Circuit breaker for resilient external store access

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `Feature flags with AI variant tracking` | Project description |
| `FlagStore` | string | `memory` | Default flag store (memory/redis/json-file or custom) |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/
    feature-flags/
      index.ts              # createFlagService facade
      types.ts              # Flag, FlagType, Variant, Rule, TargetingContext, EvaluationResult
      config.ts             # Configuration schema and defaults
      bootstrap.ts          # Placeholder validation
      logger.ts             # Structured JSON logger
      metrics.ts            # OTel counters and histograms
      evaluator.ts          # Rule evaluation engine
      tracker.ts            # Variant tracker for observability
      stores/
        types.ts            # FlagStore interface
        registry.ts         # Factory-based store registry
        memory.ts           # Map-backed store
        redis.ts            # Redis-backed store via ioredis
        json-file.ts        # JSON file on disk
        mock.ts             # Deterministic store for testing
        index.ts            # Barrel import — triggers self-registration
      resilience/
        circuit-breaker.ts
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        evaluator.test.ts
        store-registry.test.ts
        tracker.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add feature flags to a service
- [agentic-loop](../agentic-loop/) -- gate AI features behind flags
- [next-app](../next-app/) -- server-side flag evaluation in Next.js

## Nests inside

- [monorepo](../monorepo/)
