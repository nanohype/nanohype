# __PROJECT_NAME__

__DESCRIPTION__

## Getting started

### Prerequisites

- [Go](https://go.dev/dl/) >= 1.24
- PostgreSQL (or SQLite for local development)

### Run locally

```bash
# Copy environment config
cp .env.example .env

# Build and run
make run
```

The server starts on `http://localhost:8080` by default.

### Run with Docker

```bash
docker compose up --build
```

## API

### Health check

```bash
curl http://localhost:8080/health
```

### Examples CRUD

```bash
# Create
curl -X POST http://localhost:8080/api/v1/examples \
  -H "Content-Type: application/json" \
  -d '{"name": "demo", "value": "hello"}'

# List
curl http://localhost:8080/api/v1/examples

# Get by ID
curl http://localhost:8080/api/v1/examples/1

# Update
curl -X PUT http://localhost:8080/api/v1/examples/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "demo", "value": "updated"}'

# Delete
curl -X DELETE http://localhost:8080/api/v1/examples/1
```

## Configuration

Configuration is loaded from (in order of precedence):

1. Environment variables (prefixed with `__PROJECT_NAME__` uppercased, hyphens replaced with underscores)
2. Config file (`./.__PROJECT_NAME__.yaml` or `$HOME/.__PROJECT_NAME__.yaml`)
3. Defaults

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `8080` |
| `LOG_FORMAT` | Log output format (json, text) | `json` |
| `DATABASE` | Database backend | `__DATABASE__` |
| `DATABASE_URL` | Database connection string | `postgres://localhost:5432/__PROJECT_NAME__?sslmode=disable` |

## Development

```bash
# Build the binary
make build

# Run tests
make test

# Run linter
make lint

# Format code
make fmt

# Clean build artifacts
make clean
```

## Project structure

```
cmd/server/main.go          # Entrypoint with graceful shutdown
internal/
  handler/                  # HTTP handlers
  service/                  # Business logic
  repository/               # Database abstraction (interface + implementations)
  middleware/                # chi middleware (logger, recovery, request-id, body-limit)
  config/                   # Viper-based configuration
  telemetry/                # OpenTelemetry setup
```

## Architecture

- **Chi middleware chain** executes in registration order: request-id, logger, recovery, max-body. Each middleware is a standalone `func(http.Handler) http.Handler`; add or remove by editing `main.go`.
- **Three-layer separation**: handlers parse HTTP and delegate to services, services contain business logic, repositories provide the persistence interface. Handlers never touch the database directly.
- **Request ID propagation** -- the request-id middleware reads `X-Request-Id` from the incoming request or generates a UUID v4, stores it in `context.Context`, and echoes it in the response header. Logger and downstream code extract it via `GetRequestID(ctx)`.
- **Viper configuration** loads from environment variables (prefixed, uppercased), YAML config file, and built-in defaults -- in that precedence order. No custom parsing; `config.Get()` returns a typed struct.
- **Signal handling** -- the server listens for SIGINT/SIGTERM in a dedicated goroutine, then calls `srv.Shutdown(ctx)` with a 30-second deadline to drain in-flight requests before exiting.
- **Repository interface pattern** -- `internal/repository/interface.go` defines the contract; Postgres and SQLite implementations live alongside it. Swap backends by changing the construction call in `main.go`.
- **Structured logging** via `slog` with JSON (default) or text output. No third-party logging dependency.
- **Readiness probe** (`/readyz`) accepts an optional `ReadyzChecker` for dependency probing (database, cache) -- returns 503 until all checks pass.

## Production Readiness

- [ ] Set all environment variables (see `.env.example`)
- [ ] Configure `DATABASE_URL` for your production database
- [ ] Set `LOG_FORMAT=json` for structured log aggregation
- [ ] Set up health check monitoring on `/health` and `/readyz`
- [ ] Configure alerting on error rate and latency
- [ ] Run load test to establish baseline performance
- [ ] Review and tune `ReadTimeout`, `WriteTimeout`, and `IdleTimeout`
- [ ] Confirm graceful-shutdown timeout (30s) matches your load balancer drain period
- [ ] Enable OpenTelemetry export (`OTEL_EXPORTER_OTLP_ENDPOINT`) for distributed tracing
- [ ] Review and restrict `MaxBody` limit (defaults to 1 MB)

## Repository

[github.com/__ORG__/__PROJECT_NAME__](https://github.com/__ORG__/__PROJECT_NAME__)

## License

See [LICENSE](LICENSE) for details.
