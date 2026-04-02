# go-service

Scaffolds a Go HTTP service using [chi v5](https://github.com/go-chi/chi) for routing, structured middleware, a repository-pattern database layer, [Viper](https://github.com/spf13/viper) for configuration, and [OpenTelemetry](https://opentelemetry.io/docs/languages/go/) for observability.

## What you get

- An HTTP server with chi v5 routing and graceful shutdown via signal handling
- Middleware chain: request logging (`log/slog`), panic recovery, optional auth
- Repository pattern for database abstraction with PostgreSQL (pgx v5) and SQLite (go-sqlite3) implementations
- Viper-based configuration from environment variables and config files
- OpenTelemetry tracing setup
- Health check and example CRUD endpoints
- A Makefile with build, test, lint, fmt, and clean targets
- GitHub Actions CI workflow (test, vet, golangci-lint)
- Optional Dockerfile and docker-compose.yml

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `GoModule` | string | yes | `github.com/<Org>/<ProjectName>` | Full Go module path |
| `Org` | string | yes | - | GitHub org or username |
| `Description` | string | no | `A Go HTTP service` | Short project description |
| `Database` | string | no | `postgres` | Default database backend |
| `IncludeAuth` | bool | no | `true` | Include auth middleware |
| `IncludeDocker` | bool | no | `true` | Include Docker support |

## Project layout

```text
<ProjectName>/
  cmd/
    server/
      main.go                      # Entrypoint — config, server setup, graceful shutdown
  internal/
    handler/
      health.go                    # Health check handler
      example.go                   # Example CRUD handlers
    service/
      example.go                   # Business logic layer
    repository/
      interface.go                 # Repository interface
      postgres.go                  # PostgreSQL implementation
      sqlite.go                    # SQLite implementation
    middleware/
      logger.go                    # Request logging (slog)
      recovery.go                  # Panic recovery
      auth.go                      # Auth middleware (conditional)
    config/
      config.go                    # Viper-based config
    telemetry/
      telemetry.go                 # OpenTelemetry setup
  go.mod
  Makefile
  Dockerfile                       # Docker build (conditional)
  docker-compose.yml               # Docker Compose (conditional)
  .env.example
  .github/
    workflows/
      ci.yml                       # CI: test, vet, lint
  README.md
```

## Pairs with

- [infra-aws](../infra-aws/) -- deploy to AWS
- [infra-fly](../infra-fly/) -- deploy to Fly.io
- [eval-harness](../eval-harness/) -- test and evaluation framework

## Nests inside

- [monorepo](../monorepo/)
