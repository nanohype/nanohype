# monitoring-stack

Standalone observability bundle with Grafana, Prometheus, and Loki. One command to start, batteries included with auto-provisioned datasources and pre-built dashboards.

## What you get

- Grafana on port 3000 with auto-provisioned Prometheus and Loki datasources
- Prometheus on port 9090 with scrape configs for self-monitoring, node-exporter, and application targets
- Loki on port 3100 in single-binary mode with filesystem storage and configurable retention
- Pre-built service dashboard: request rate, error rate, latency percentiles (p50/p95/p99), status code distribution
- Pre-built system dashboard: CPU usage, memory consumption, goroutines/threads, open file descriptors
- Optional alert rules for high error rate, high latency, service down, high CPU, high memory, and disk full
- Helm chart alternative for Kubernetes deployment with Deployment, Service, and ConfigMap per component
- Environment-based configuration for admin password and retention settings

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Description` | string | `Observability stack with Grafana, Prometheus, and Loki` | Project description |
| `DeployTarget` | string | `docker-compose` | Primary deployment target |
| `IncludeAlerts` | bool | `true` | Include Prometheus alert rules |

## Project layout

```text
<ProjectName>/
  docker-compose.yml              # Grafana + Prometheus + Loki
  prometheus/
    prometheus.yml                # Scrape configs
    rules/                        # (optional) Alert rules
      service.yml                 # Error rate, latency, service down
      system.yml                  # CPU, memory, disk
  grafana/
    provisioning/
      datasources/
        datasources.yml           # Auto-provision Prometheus + Loki
      dashboards/
        dashboards.yml            # Dashboard provider config
    dashboards/
      service.json                # Request rate, errors, latency
      system.json                 # CPU, memory, disk, network
  loki/
    loki-config.yml               # Single-binary mode, filesystem storage
  chart/                          # Helm chart alternative
    Chart.yaml
    values.yaml
    templates/
      _helpers.tpl
      namespace.yaml
      grafana/
        deployment.yaml
        service.yaml
        configmap-datasources.yaml
        configmap-dashboards.yaml
      prometheus/
        deployment.yaml
        service.yaml
        configmap.yaml
      loki/
        statefulset.yaml
        service.yaml
        configmap.yaml
  .env.example                    # GRAFANA_ADMIN_PASSWORD, retention
  .gitignore
  README.md
```

## Pairs with

- [ts-service](../ts-service/) -- monitor TypeScript API services
- [go-service](../go-service/) -- monitor Go HTTP services
- [k8s-deploy](../k8s-deploy/) -- deploy monitoring alongside applications

## Nests inside

- [monorepo](../monorepo/)
