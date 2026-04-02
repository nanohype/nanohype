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
  routes/
    health.ts               # GET /health
    example.ts              # Example CRUD routes
  middleware/
    logger.ts               # Request logging middleware
    error-handler.ts        # Error handling middleware
    auth.ts                 # Auth middleware (conditional)
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

### Adding a Driver

1. Create a new file in `src/db/drivers/` implementing the `DatabaseDriver` interface
2. Call `registerDriver()` at the module level to self-register
3. Import the new driver in `src/db/client.ts`

## Auth

The auth middleware (`src/middleware/auth.ts`) validates JWT Bearer tokens. To protect routes, apply the middleware to specific routes or groups in `src/app.ts`:

```ts
import { authMiddleware } from "./middleware/auth.js";

app.use("/api/*", authMiddleware);
```

The verifier is pluggable. Replace the `verifyToken` function in `auth.ts` to integrate with your auth provider (JWKS, asymmetric keys, external service).

## Pairs With

- **infra-aws** — Deploy to AWS with ECS, ALB, and RDS
- **infra-fly** — Deploy to Fly.io
- **module-database** — Extended database patterns and seed data
- **module-auth** — Full auth flows (signup, login, refresh)

## Nests Inside

- **monorepo** — Add as a package in a nanohype monorepo workspace
