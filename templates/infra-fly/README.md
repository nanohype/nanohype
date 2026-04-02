# infra-fly

Fly.io deployment configuration with fly.toml, multi-stage Dockerfile, deploy scripts, and optional Postgres, Redis, and CI/CD provisioning.

## What you get

- `fly.toml` with app config, health checks, and machine sizing
- Multi-stage Dockerfile (Go by default, easily adapted)
- Deploy script with pre-flight checks (auth, app existence)
- Optional Fly Postgres setup script
- Optional Fly Redis (Upstash) setup script
- Optional GitHub Actions workflow for deploy on push to main

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | -- | Kebab-case project name |
| `Description` | string | no | `Fly.io deployment configuration` | Project description |
| `AppName` | string | yes | -- | Fly app name (globally unique) |
| `Region` | string | no | `iad` | Fly.io region code |
| `MachineSize` | string | no | `shared-cpu-1x` | VM size |
| `IncludePostgres` | bool | no | `false` | Include Postgres setup |
| `IncludeRedis` | bool | no | `false` | Include Redis setup |
| `IncludeCi` | bool | no | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  fly.toml                # Fly.io app configuration
  Dockerfile              # Multi-stage container build
  scripts/
    deploy.sh             # Deploy with pre-flight checks
    setup-db.sh           # (optional) Fly Postgres provisioning
    setup-redis.sh        # (optional) Fly Redis provisioning
  .github/
    workflows/
      deploy.yml          # (optional) CI/CD deploy on push to main
```

## Pairs with

- [go-service](../go-service/) -- deploy Go HTTP services
- [ts-service](../ts-service/) -- deploy TypeScript API services
- [go-cli](../go-cli/) -- deploy CLI tools as containers

## Nests inside

- [monorepo](../monorepo/)
