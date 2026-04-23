# go-service

Scaffolds a Go HTTP service using [chi v5](https://github.com/go-chi/chi) for routing, structured middleware, a repository-pattern database layer, [Viper](https://github.com/spf13/viper) for configuration, and [OpenTelemetry](https://opentelemetry.io/docs/languages/go/) for observability. Auth-neutral — stack `module-auth-go` alongside for authentication.

## What you get

- An HTTP server with chi v5 routing and graceful shutdown via signal handling
- Middleware chain: request logging (`log/slog`), panic recovery
- Repository pattern for database abstraction with PostgreSQL (pgx v5) and SQLite (go-sqlite3) implementations
- Viper-based configuration from environment variables and config files
- OpenTelemetry tracing setup
- Health check and example CRUD endpoints
- A Makefile with build, test, lint, fmt, and clean targets
- GitHub Actions CI workflow (test, vet, golangci-lint)
- Optional Dockerfile and docker-compose.yml

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `GoModule` | string | `github.com/<Org>/<ProjectName>` | Full Go module path |
| `Org` | string | (required) | GitHub org or username |
| `Description` | string | `A Go HTTP service` | Short project description |
| `Database` | string | `postgres` | Default database backend |
| `IncludeDocker` | bool | `true` | Include Docker support |

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
      request_id.go                # Request-id propagation
      max_body.go                  # Body size limit
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
- [module-auth-go](../module-auth-go/) -- authentication (canonical -- stack alongside when you need auth)

## Nests inside

- [monorepo](../monorepo/)
