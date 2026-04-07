# infra-gcp

GCP deployment configuration using gcloud CLI. Deploys to Cloud Run with a multi-stage Dockerfile, deploy scripts, and optional Cloud SQL PostgreSQL, Cloud Monitoring, and CI/CD.

## What you get

- Cloud Run service configuration with deploy script
- Multi-stage Dockerfile (Go by default, easily adapted)
- Deploy script with pre-flight checks (auth, project, APIs)
- Optional Cloud SQL PostgreSQL setup script
- Optional Cloud Monitoring dashboard and alert policies
- Optional GitHub Actions workflow for deploy on push to main

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Description` | string | `GCP infrastructure` | Project description |
| `GcpProject` | string | (required) | GCP project ID |
| `GcpRegion` | string | `us-central1` | GCP region |
| `IncludeCloudSql` | bool | `false` | Include Cloud SQL PostgreSQL |
| `IncludeMonitoring` | bool | `true` | Include Cloud Monitoring |
| `IncludeCi` | bool | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  Dockerfile              # Multi-stage container build
  scripts/
    deploy.sh             # Deploy to Cloud Run with pre-flight checks
    setup-db.sh           # (optional) Cloud SQL PostgreSQL provisioning
    setup-monitoring.sh   # (optional) Deploy monitoring dashboard and alerts
  monitoring/
    dashboard.json        # (optional) Cloud Monitoring dashboard definition
    alerts.json           # (optional) Alert policy definitions
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
