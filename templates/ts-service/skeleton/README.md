# __PROJECT_NAME__

__DESCRIPTION__

A TypeScript HTTP service built with __FRAMEWORK__ and [OpenTelemetry](https://opentelemetry.io). Auth-neutral and persistence-neutral — stack `module-auth-ts` and `module-database-ts` alongside when you need those capabilities.

## What You Get

- **Hono** HTTP framework with middleware pipeline
- **Zod** request validation with an OpenAPI 3.1 spec generator
- **OpenTelemetry** traces and metrics (console exporter by default, OTLP-ready)
- **Docker** multi-stage build and Compose
- **CI** via GitHub Actions

## Variables

| Variable | Description | Default |
|---|---|---|
| `ProjectName` | Kebab-case project name | _(required)_ |
| `Description` | Short project description | A TypeScript HTTP service |
| `Framework` | HTTP framework | hono |
| `IncludeDocker` | Include Dockerfile and Compose | true |

## Getting Started

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000`. Hit the health check:

```bash
curl http://localhost:3000/health
```

### With Docker

```bash
docker compose up
```

## Project Layout

```
src/
  index.ts                  # Entrypoint — create app, start server
  app.ts                    # Hono app setup, mount routes and middleware
  openapi.ts                # OpenAPI 3.1 spec generator from Zod schemas
  routes/
    health.ts               # GET /health
    example.ts              # Example CRUD routes (in-memory)
    openapi.ts              # GET /openapi.json — serves the OpenAPI spec
  middleware/
    logger.ts               # Request logging middleware
    error-handler.ts        # Error handling middleware
    idempotency.ts          # Idempotency-Key middleware for POST/PUT/PATCH
  schemas/
    example.ts              # Zod request validation schemas
  services/
    example.ts              # Business logic (in-memory store)
  telemetry/
    index.ts                # OpenTelemetry setup (traces + metrics)
load-test/
  k6/
    script.js               # K6 load test script
    config.json             # Stages and threshold configuration
  README.md                 # Load testing instructions
```

## Adding Routes

1. Create a new file in `src/routes/` following the pattern in `src/routes/example.ts`
2. Export a `Hono` instance with your routes
3. Mount it in `src/app.ts` with `app.route("/path", yourRoutes)`

## Auth

This service ships auth-neutral. For authentication, scaffold `module-auth-ts` alongside this template and apply its middleware in `src/app.ts`:

```ts
import { createAuthMiddleware } from "__PROJECT_NAME__-auth";

app.use("/api/*", createAuthMiddleware({ provider: "jwt" }));
```

`module-auth-ts` provides a pluggable provider registry (JWT, Clerk, Auth0, Supabase, API key) with typed helpers for role checks and user extraction. See that module's README for configuration details.

## Database

This service ships persistence-neutral. The example routes use an in-memory `Map` to keep the standalone template runnable without a database dependency. For real persistence, scaffold [`module-database-ts`](../module-database-ts/) alongside this template and import from it in your services:

```ts
import { getDb } from "__PROJECT_NAME__-db";

const db = getDb();
const rows = await db.select().from(items);
```

`module-database-ts` provides a pluggable driver registry (PostgreSQL, SQLite, Turso) with Drizzle ORM, migrations via drizzle-kit, and a bootstrap helper for dependency-injection setups. See that module's README for schema and migration workflow.

## Architecture

- **Middleware stack executes in declaration order** -- request-id, CORS, body-limit, logger, then the error handler as an `onError` catch-all. Each middleware is a standalone Hono handler; add or remove by editing `app.ts`.
- **Three-layer domain separation**: routes parse HTTP and delegate to services, services contain business logic. Services never import Hono -- they are framework-agnostic, which makes swapping the in-memory store for a `module-database-ts` repository a local change.
- **Typed error hierarchy** (`AppError` subclasses) maps domain errors to HTTP status codes. The error-handler middleware catches `AppError` instances and returns structured JSON; unknown errors produce a generic 500 with no leaked internals.
- **Zod config validation at startup** -- `loadConfig()` parses `process.env` against a schema and exits immediately on invalid or missing values. No silent misconfiguration at runtime.
- **Bootstrap guard** detects unresolved `__PLACEHOLDER__` patterns left from incomplete scaffolding and halts the process with a diagnostic message.
- **Graceful shutdown** -- SIGTERM/SIGINT stop accepting connections, drain in-flight requests, and force-exit after 10 seconds to prevent zombie pods.
- **Readiness probe** (`/readyz`) starts unhealthy and flips to ready only after the server is listening, giving load balancers a safe promotion signal.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure `CORS_ORIGIN` for your domain (defaults to `*`)
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Set up health check monitoring on `/health` and `/readyz`
- [ ] Configure alerting on error rate and p99 latency
- [ ] Run load test to establish baseline performance
- [ ] Review and restrict body-limit size (defaults to 1 MB)
- [ ] Confirm graceful-shutdown timeout matches your load balancer drain period
- [ ] Enable OpenTelemetry export (`OTEL_EXPORTER_OTLP_ENDPOINT`) for distributed tracing

## Pairs With

- **infra-aws** — Deploy to AWS with ECS, ALB, and RDS
- **infra-fly** — Deploy to Fly.io
- **module-auth-ts** — Authentication (JWT, Clerk, Auth0, Supabase, API key)
- **module-database-ts** — Database layer (PostgreSQL, SQLite, Turso with Drizzle ORM and migrations)

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
