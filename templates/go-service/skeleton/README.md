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
  middleware/                # chi middleware (logger, recovery, auth)
  config/                   # Viper-based configuration
  telemetry/                # OpenTelemetry setup
```

## Repository

[github.com/__ORG__/__PROJECT_NAME__](https://github.com/__ORG__/__PROJECT_NAME__)

## License

See [LICENSE](LICENSE) for details.
