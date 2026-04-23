# module-queue-ts

Composable background job processing with pluggable brokers.

## What you get

- Provider registry pattern with self-registering queue backends
- In-memory provider for development and testing
- BullMQ provider for Redis-backed production queues
- AWS SQS provider with long polling and visibility timeout handling
- Type-safe job definitions with `defineJob<T>()` factory
- Configurable worker with polling, concurrency, and graceful shutdown
- Priority scheduling, delayed jobs, and automatic retries

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `Background job processing with pluggable queue providers` | Project description |
| `QueueProvider` | string | `memory` | Default queue provider (memory/bullmq/sqs or custom) |

## Project layout

```text
<ProjectName>/
  src/
    queue/
      index.ts              # Main exports — createQueue, createWorker
      types.ts              # Job, JobOptions, QueueConfig, HandlerMap interfaces
      job.ts                # Job definition helpers and defineJob factory
      worker.ts             # Worker runner — polls provider and executes handlers
      providers/
        types.ts            # QueueProvider interface
        registry.ts         # Provider registry (register, get, list)
        memory.ts           # In-memory queue (dev/testing)
        bullmq.ts           # BullMQ Redis-backed queue
        sqs.ts              # AWS SQS queue with long polling
        index.ts            # Barrel import — triggers self-registration
      __tests__/
        registry.test.ts
        memory.test.ts
        worker.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add background job processing to a service
- [agentic-loop](../agentic-loop/) -- queue async agent tasks

## Nests inside

- [monorepo](../monorepo/)
