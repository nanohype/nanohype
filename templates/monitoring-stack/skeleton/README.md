# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```bash
# Copy environment file and set your Grafana admin password
cp .env.example .env

# Start the stack
docker compose up -d

# Verify all containers are running
docker compose ps
```

## Accessing

| Service    | URL                    | Default Credentials |
|------------|------------------------|---------------------|
| Grafana    | http://localhost:3000  | admin / admin       |
| Prometheus | http://localhost:9090  | --                  |
| Loki       | http://localhost:3100  | --                  |

## Adding Dashboards

1. Create a JSON dashboard file in `grafana/dashboards/`
2. Grafana auto-discovers new files every 30 seconds (configured in `grafana/provisioning/dashboards/dashboards.yml`)
3. Alternatively, create dashboards in the Grafana UI and export as JSON

## Adding Scrape Targets

Edit `prometheus/prometheus.yml` to add new scrape targets:

```yaml
scrape_configs:
  - job_name: "my-service"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["host.docker.internal:8080"]
        labels:
          service: "my-service"
          environment: "development"
```

Reload Prometheus without restarting:

```bash
curl -X POST http://localhost:9090/-/reload
```

## Sending Logs to Loki

Push logs to Loki using the HTTP API or install a log shipping agent:

```bash
# Direct push via API
curl -X POST http://localhost:3100/loki/api/v1/push \
  -H "Content-Type: application/json" \
  -d '{"streams":[{"stream":{"app":"__PROJECT_NAME__"},"values":[["'"$(date +%s)000000000"'","hello from __PROJECT_NAME__"]]}]}'

# Or use Docker plugin for container logs
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

## Helm Alternative

Deploy to Kubernetes using the included Helm chart:

```bash
# Install the chart
helm install __PROJECT_NAME__ ./chart --namespace monitoring --create-namespace

# Upgrade after changes
helm upgrade __PROJECT_NAME__ ./chart --namespace monitoring

# Uninstall
helm uninstall __PROJECT_NAME__ --namespace monitoring
```

## Architecture

```
                    +------------------+
                    |     Grafana      |
                    |    :3000         |
                    +--------+---------+
                             |
                    +--------+---------+
                    |                  |
           +-------v------+   +-------v------+
           |  Prometheus   |   |    Loki      |
           |   :9090       |   |   :3100      |
           +-+----------+--+   +------+-------+
             |          |             |
        scrape      alert         log push
        targets      rules        (HTTP API)
             |          |             |
     +-------v--+  +----v----+  +-----v------+
     | Services  |  | Rules   |  | Docker /   |
     | /metrics  |  | YAML    |  | Agents     |
     +-----------+  +---------+  +------------+
```

- **Grafana** queries Prometheus for metrics and Loki for logs. Datasources are auto-provisioned on startup.
- **Prometheus** scrapes metrics endpoints at a configurable interval (default 15s). Alert rules evaluate periodically and fire when thresholds are breached.
- **Loki** receives log streams via HTTP push. Stores data on the local filesystem in single-binary mode with configurable retention.

## Production Readiness

Before deploying to production, consider:

- **Authentication**: Change the default Grafana admin password. Enable OAuth or LDAP for team access.
- **Storage**: Replace Docker volumes with persistent storage. For Prometheus, consider remote write to long-term storage (Thanos, Cortex). For Loki, switch to object storage (S3, GCS).
- **High Availability**: Run multiple Prometheus replicas with deduplication. Use Loki's microservices mode for horizontal scaling.
- **Alerting**: Configure Alertmanager for routing alerts to Slack, PagerDuty, or email. The included alert rules are starting points -- tune thresholds for your workload.
- **TLS**: Terminate TLS at the ingress layer or configure each component with certificates.
- **Resource Limits**: Adjust CPU and memory limits in `docker-compose.yml` or Helm `values.yaml` based on cardinality and ingestion rate.
- **Retention**: Set `PROMETHEUS_RETENTION` and Loki compactor retention to match your compliance and storage budget.
- **Network Policies**: In Kubernetes, restrict traffic between components with NetworkPolicy resources.
