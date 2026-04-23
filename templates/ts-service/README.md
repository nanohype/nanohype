# ts-service

TypeScript HTTP service with the Hono framework and OpenTelemetry instrumentation. Auth-neutral and persistence-neutral — stack `module-auth-ts` alongside for authentication and `module-database-ts` for a database layer.

## What you get

- Hono HTTP framework with structured routes and middleware
- Zod-validated request schemas and an OpenAPI 3.1 spec generator
- OpenTelemetry traces and metrics (console + OTLP exporters)
- Request logging, error handling, idempotency, and body-limit middleware
- Docker and docker-compose setup (conditional)
- GitHub Actions CI

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `A TypeScript HTTP service` | Project description |
| `Framework` | string | `hono` | HTTP framework |
| `IncludeDocker` | bool | `true` | Include Dockerfile and docker-compose |

## Project layout

```text
<ProjectName>/
  src/
    index.ts              # Entrypoint
    app.ts                # Hono app setup
    routes/
      health.ts           # Health check
      example.ts          # Example CRUD routes (in-memory)
    middleware/
      logger.ts           # Request logging
      error-handler.ts    # Error handling
      idempotency.ts      # Idempotency-Key middleware
    schemas/
      example.ts          # Zod request validation schemas
    services/
      example.ts          # Business logic (in-memory store)
    telemetry/
      index.ts            # OpenTelemetry setup
```

## Pairs with

- [infra-aws](../infra-aws/) -- deploy to AWS
- [infra-fly](../infra-fly/) -- deploy to Fly.io
- [module-auth-ts](../module-auth-ts/) -- authentication (canonical -- stack alongside when you need auth)
- [module-database-ts](../module-database-ts/) -- database layer (canonical -- stack alongside when you need persistence)

## Nests inside

- [monorepo](../monorepo/)
