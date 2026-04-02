# ts-service

TypeScript HTTP service with Hono framework, pluggable database drivers, JWT auth middleware, and OpenTelemetry instrumentation.

## What you get

- Hono HTTP framework with structured routes and middleware
- Database driver registry (PostgreSQL, SQLite) with Drizzle ORM
- JWT auth middleware with pluggable verifier (conditional)
- OpenTelemetry traces and metrics (console + OTLP exporters)
- Request logging and error handling middleware
- Docker and docker-compose setup (conditional)
- GitHub Actions CI

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `A TypeScript HTTP service` | Project description |
| `Framework` | string | `hono` | HTTP framework |
| `Database` | string | `postgres` | Database driver (postgres/sqlite/none or custom) |
| `IncludeAuth` | bool | `true` | Include JWT auth middleware |
| `IncludeDocker` | bool | `true` | Include Dockerfile and docker-compose |

## Project layout

```text
<ProjectName>/
  src/
    index.ts              # Entrypoint
    app.ts                # Hono app setup
    routes/
      health.ts           # Health check
      example.ts          # Example CRUD routes
    middleware/
      logger.ts           # Request logging
      error-handler.ts    # Error handling
      auth.ts             # (optional) JWT auth
    db/
      client.ts           # Database client
      schema.ts           # Drizzle schema
      drivers/            # Pluggable driver registry
    telemetry/
      index.ts            # OpenTelemetry setup
```

## Pairs with

- [infra-aws](../infra-aws/) -- deploy to AWS
- [infra-fly](../infra-fly/) -- deploy to Fly.io
- [module-database](../module-database/) -- extended database layer
- [module-auth](../module-auth/) -- extended auth providers

## Nests inside

- [monorepo](../monorepo/)
