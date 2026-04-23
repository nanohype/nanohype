# __PROJECT_NAME__

__DESCRIPTION__

A TypeScript HTTP service built with __FRAMEWORK__, [Drizzle ORM](https://orm.drizzle.team), and [OpenTelemetry](https://opentelemetry.io).

## What You Get

- **Hono** HTTP framework with middleware pipeline
- **Drizzle ORM** with pluggable database drivers (Postgres, SQLite)
- **OpenTelemetry** traces and metrics (console exporter by default, OTLP-ready)
- **JWT authentication** middleware with pluggable verifier
- **Docker** multi-stage build and Compose with Postgres
- **CI** via GitHub Actions

## Variables

| Variable | Description | Default |
|---|---|---|
| `ProjectName` | Kebab-case project name | _(required)_ |
| `Description` | Short project description | A TypeScript HTTP service |
| `Framework` | HTTP framework | hono |
| `Database` | Database backend | postgres |
| `IncludeAuth` | Include JWT auth middleware | true |
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
    example.ts              # Example CRUD routes
    openapi.ts              # GET /openapi.json — serves the OpenAPI spec
  middleware/
    logger.ts               # Request logging middleware
    error-handler.ts        # Error handling middleware
    idempotency.ts          # Idempotency-Key middleware for POST/PUT/PATCH
    auth.ts                 # Auth middleware (conditional)
  schemas/
    example.ts              # Zod request validation schemas
  db/
    client.ts               # Database client (registry pattern)
    schema.ts               # Example schema (Drizzle ORM)
    migrate.ts              # Migration runner
    drivers/
      postgres.ts           # PostgreSQL driver, self-registers
      sqlite.ts             # SQLite driver, self-registers
      registry.ts           # Driver registry
      types.ts              # DatabaseDriver interface
  telemetry/
    index.ts                # OpenTelemetry setup (traces + metrics)
drizzle/                    # Generated migration files (committed to VCS)
drizzle.config.ts           # Drizzle Kit configuration
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

## Database Setup

### Postgres (default)

Set `DATABASE_URL` in `.env`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/__PROJECT_NAME__
```

### SQLite

```
DATABASE_URL=sqlite://data/local.db
```

### Schema and Migrations

Edit `src/db/schema.ts` to define tables, then generate and run migrations:

```bash
npm run db:generate
npm run db:migrate
```

### Migration Workflow

The migration lifecycle uses [drizzle-kit](https://orm.drizzle.team/kit-docs/overview) powered by `drizzle.config.ts` at the project root.

```bash
# 1. Edit src/db/schema.ts with your table changes

# 2. Generate SQL migration files into drizzle/
npm run db:generate

# 3. Review the generated SQL in drizzle/*.sql

# 4. Apply migrations to the database
npm run db:migrate

# 5. (Dev shortcut) Push schema directly without generating migration files
npm run db:push

# 6. Browse data visually
npm run db:studio
```

Migration files are stored in the `drizzle/` directory and should be committed to version control. Each migration is timestamped and applied in order. Never edit a migration that has already been applied to a shared environment -- create a new one instead.

### Adding a Driver

1. Create a new file in `src/db/drivers/` implementing the `DatabaseDriver` interface
2. Call `registerDriver()` at the module level to self-register
3. Import the new driver in `src/db/client.ts`

## Auth

This service ships auth-neutral. For authentication, scaffold `module-auth-ts` alongside this template and apply its middleware in `src/app.ts`:

```ts
import { createAuthMiddleware } from "__PROJECT_NAME__-auth";

app.use("/api/*", createAuthMiddleware({ provider: "jwt" }));
```

`module-auth-ts` provides a pluggable provider registry (JWT, Clerk, Auth0, Supabase, API key) with typed helpers for role checks and user extraction. See that module's README for configuration details.

## Architecture

- **Middleware stack executes in declaration order** -- request-id, CORS, body-limit, logger, then the error handler as an `onError` catch-all. Each middleware is a standalone Hono handler; add or remove by editing `app.ts`.
- **Three-layer domain separation**: routes parse HTTP and delegate to services, services contain business logic and depend on a repository interface, repositories handle persistence. Services never import Hono -- they are framework-agnostic.
- **Typed error hierarchy** (`AppError` subclasses) maps domain errors to HTTP status codes. The error-handler middleware catches `AppError` instances and returns structured JSON; unknown errors produce a generic 500 with no leaked internals.
- **Zod config validation at startup** -- `loadConfig()` parses `process.env` against a schema and exits immediately on invalid or missing values. No silent misconfiguration at runtime.
- **Bootstrap guard** detects unresolved `__PLACEHOLDER__` patterns left from incomplete scaffolding and halts the process with a diagnostic message.
- **Database driver registry** -- drivers self-register on import. `client.ts` resolves the driver by `DATABASE_URL` scheme, so adding a new backend is one file plus one import.
- **Graceful shutdown** -- SIGTERM/SIGINT stop accepting connections, drain in-flight requests, and force-exit after 10 seconds to prevent zombie pods.
- **Readiness probe** (`/readyz`) starts unhealthy and flips to ready only after the server is listening, giving load balancers a safe promotion signal.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Replace default `JWT_SECRET` -- the config schema rejects the placeholder value
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
- **module-database-ts** — Extended database patterns and seed data
- **module-auth-ts** — Full auth flows (signup, login, refresh)

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
