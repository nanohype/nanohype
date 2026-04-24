# __PROJECT_NAME__

__DESCRIPTION__

Spring Boot 4 HTTP service on JDK 25 with Spring Web MVC, Actuator, Spring Data JPA, Flyway migrations, Micrometer + OpenTelemetry, and structured JSON logging.

**Default database:** `__DATABASE__` (pom.xml ships drivers for `postgres`, `mysql`, and `h2` — switch by setting `SPRING_DATASOURCE_URL`).

## Quickstart

```sh
# start Postgres
docker compose up -d db

# run the app on port 8080 with the local profile
make run

curl http://localhost:8080/api/v1/hello
curl http://localhost:8080/actuator/health
```

## Make targets

| Target | Description |
|---|---|
| `make run` | Boot the app with the `local` profile |
| `make test` | Unit tests |
| `make verify` | Unit + integration tests (Testcontainers) |
| `make package` | Build jar (skipping tests) |
| `make docker` | Build OCI image via `spring-boot:build-image` |
| `make docker-run` | `docker compose up --build` |

## Layout

```text
src/main/java/__PKG_DIR__/
  Application.java               # @SpringBootApplication entrypoint
  config/
    OpenApiConfig.java           # springdoc-openapi
    ObservabilityConfig.java     # Micrometer + OTel setup
  web/                           # REST controllers + exception handler
  service/                       # @Transactional business logic
  domain/                        # JPA entities
  repository/                    # Spring Data JPA repositories
src/main/resources/
  application.yaml               # Default config (env var overrides)
  application-local.yaml         # Local profile overrides
  logback-spring.xml             # JSON logs w/ trace correlation
  db/migration/V1__init.sql      # Flyway baseline
```

## Configuration

All configuration is driven by environment variables — see `.env.example`. The `local` profile loads Postgres on `localhost:5432` for dev.

## Authentication

This service ships auth-neutral. Stack [`module-spring-security`](../module-spring-security/) alongside to add OAuth 2.0 JWT / API-key / opaque-token authentication with a pluggable multi-provider filter chain. The module drops its sources into `src/main/java/<PackageDir>/security/` and expects you to add the Spring Security Maven dependencies documented in that module's README.

## Observability

- `GET /actuator/health` — aggregate health; `/health/liveness` and `/health/readiness` for Kubernetes probes
- `GET /actuator/prometheus` — Prometheus scrape endpoint
- Traces exported via OTLP to `OTEL_EXPORTER_OTLP_ENDPOINT` (defaults to `http://localhost:4318/v1/traces`)
- Logs emitted as JSON with `traceId` and `spanId` fields for correlation

## OpenAPI

- `GET /v3/api-docs` — OpenAPI JSON
- `GET /swagger-ui.html` — Swagger UI
