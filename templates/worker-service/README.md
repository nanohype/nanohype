# worker-service

Background processor with scheduled cron jobs and queue consumption. Includes a lightweight cron scheduler, poll-based queue consumer, circuit breaker, OpenTelemetry metrics, and Kubernetes health probes.

## What you get

- Cron scheduler with standard 5-field expression parsing (no external cron library)
- Queue consumer with pluggable providers (memory default, extensible to BullMQ/SQS)
- Circuit breaker for resilience on external calls
- OpenTelemetry counters and histograms (worker_job_total, worker_job_duration_ms, worker_cron_total)
- Minimal Hono health server for /health and /readyz probes
- Graceful shutdown draining both cron ticks and in-flight queue jobs
- Zod-validated configuration
- Vitest test suite (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Background worker with cron and queue processing` | Project description |
| `QueueProvider` | string | `memory` | Default queue provider (memory/bullmq/sqs or custom) |
| `IncludeCron` | bool | `true` | Include cron scheduler |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/worker/
    index.ts              # Entry -- starts scheduler + consumer + health server
    types.ts              # WorkerConfig, JobDefinition, CronJobDefinition
    config.ts             # Zod-validated config from env vars
    bootstrap.ts          # Placeholder validation
    logger.ts             # Structured console logger
    metrics.ts            # OTel metrics
    scheduler/            # (conditional on IncludeCron)
      cron.ts             # CronScheduler with 5-field expression parser
      types.ts            # Scheduler-specific types
      jobs/
        example.ts        # Example: cleanup stale data
    consumer/
      handler.ts          # QueueConsumer -- poll + dispatch
      types.ts            # Consumer-specific types
      jobs/
        example.ts        # Example: send notification
    health/
      server.ts           # Hono HTTP on separate port for /health, /readyz
    resilience/
      circuit-breaker.ts  # Circuit breaker pattern
    __tests__/            # (conditional on IncludeTests)
      scheduler.test.ts
      consumer.test.ts
      health.test.ts
```

## Pairs with

- [module-queue-ts](../module-queue-ts/) -- extended queue providers
- [infra-aws](../infra-aws/) -- deploy to AWS
- [infra-fly](../infra-fly/) -- deploy to Fly.io
- [k8s-deploy](../k8s-deploy/) -- Kubernetes deployment

## Nests inside

- [monorepo](../monorepo/)
