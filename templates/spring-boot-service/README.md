# spring-boot-service

Scaffolds a Java [Spring Boot 4](https://spring.io/projects/spring-boot) HTTP service on **JDK 25** (latest LTS) with Spring Web MVC, Spring Boot Actuator, Spring Data JPA + [Flyway](https://flywaydb.org/) migrations, Micrometer + [OpenTelemetry](https://opentelemetry.io/) instrumentation, and a clean controller / service / repository layering. Auth-neutral — stack [`module-spring-security`](../module-spring-security/) alongside for authentication.

## What you get

- A Spring Boot 4 application with embedded Tomcat and graceful shutdown
- Layered architecture: web controllers, service layer, JPA repositories, domain entities
- Spring Boot Actuator endpoints: `/actuator/health` (liveness + readiness groups), `/actuator/info`, `/actuator/prometheus`
- JPA entity with a Flyway baseline migration (`V1__init.sql`)
- Micrometer metrics with a Prometheus scrape endpoint and OpenTelemetry tracing (OTLP exporter, configurable endpoint)
- Structured JSON logging via Logback with trace/span correlation fields
- Testcontainers-backed integration test (`ExampleIntegrationTest`) that exercises the real database
- `Makefile` with common targets (`run`, `test`, `package`, `lint`, `clean`, `docker`)
- GitHub Actions CI workflow (build, test, dependency submission for SBOM)
- k6 load test scaffolding
- Optional multi-stage `Dockerfile` and `docker-compose.yml` with a bundled Postgres

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `GroupId` | string | `com.example` | Maven groupId (reverse-DNS, dot-separated) |
| `ArtifactId` | string | `<ProjectName>` | Maven artifactId (kebab-case) |
| `Description` | string | `A Spring Boot HTTP service` | Short project description |
| `JavaPackage` | string | `<GroupId>.app` | Root Java package, dot form (e.g. `com.example.app`) |
| `PackageDir` | string | `com/example/app` | Root Java package, slash form — must pair with `JavaPackage` |
| `Database` | string | `postgres` | Database driver: `postgres`, `mysql`, or `h2` |
| `IncludeDocker` | bool | `true` | Include Dockerfile and docker-compose.yml |

### On the two package variables

nanohype placeholders are literal string substitutions — there's no way to derive the slash-form of a package from its dot-form. That's why `JavaPackage` (e.g. `com.example.app`) and `PackageDir` (e.g. `com/example/app`) are exposed as separate variables. Keep them in sync when you override.

## Project layout

```text
<ProjectName>/
  pom.xml                                # Maven build, Spring Boot 4 parent, dependencies
  Makefile                               # run, test, package, lint, clean, docker
  Dockerfile                             # Multi-stage build (conditional)
  docker-compose.yml                     # App + Postgres for local dev (conditional)
  .env.example
  .gitignore
  .github/
    workflows/
      ci.yml                             # Build, test, SBOM dependency submission
  src/
    main/
      java/
        <PackageDir>/
          Application.java               # Entrypoint — @SpringBootApplication
          config/
            OpenApiConfig.java           # springdoc-openapi setup
            ObservabilityConfig.java     # Micrometer + OTel bootstrap
          web/
            HealthController.java        # Custom /api/v1/hello endpoint
            ExampleController.java       # Example CRUD
            GlobalExceptionHandler.java  # @ControllerAdvice with problem+json
          service/
            ExampleService.java          # Business logic
          domain/
            ExampleEntity.java           # JPA entity
          repository/
            ExampleRepository.java       # Spring Data JPA repo
      resources/
        application.yaml                 # Default config
        application-local.yaml           # Local profile overrides
        logback-spring.xml               # JSON structured logging
        db/migration/
          V1__init.sql                   # Flyway baseline
    test/
      java/
        <PackageDir>/
          ApplicationTests.java          # Context load
          web/HealthControllerTest.java  # @WebMvcTest
          ExampleIntegrationTest.java    # Testcontainers + full stack
  load-test/
    k6/
      script.js
      config.json
    README.md
  README.md
```

## Pairs with

- [k8s-deploy](../k8s-deploy/) — Kubernetes manifests and Helm chart for deployment
- [monitoring-stack](../monitoring-stack/) — Prometheus + Grafana + Loki observability stack
- [infra-gcp](../infra-gcp/) — deploy to Google Cloud Run
- [infra-aws](../infra-aws/) — deploy to AWS ECS or Lambda
- [module-spring-security](../module-spring-security/) — authentication (canonical — stack alongside when you need auth)

## Nests inside

- [monorepo](../monorepo/)
