# infra-druid

Helm chart for deploying an Apache Druid OLAP cluster on Kubernetes. Six services (router, broker, coordinator, overlord, historical, task) with Kubernetes-native service discovery, configurable metadata and deep storage backends, and production-grade defaults.

## What you get

- Helm chart with all six Druid services as StatefulSets (router uses Deployment)
- Per-component ConfigMaps with runtime properties, JVM settings, and log4j configuration
- Shared ConfigMap for common runtime properties (discovery, metadata, deep storage, extensions)
- Kubernetes-native service discovery (no ZooKeeper dependency)
- ServiceAccount with configurable IAM role annotation for cloud storage access
- Optional cert-manager Certificate for internal mTLS between Druid services
- Optional Prometheus metrics emitter with scrape annotations
- K8s-native task execution via pod templates (overlord launches task pods directly)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `Description` | string | `Apache Druid OLAP cluster` | Project description |
| `DruidVersion` | string | `36.0.0` | Druid container image version |
| `MetadataDriver` | string | `postgresql` | Metadata storage driver |
| `DeepStorageType` | string | `s3` | Deep storage backend |
| `IncludeMonitoring` | bool | `true` | Include Prometheus metrics emitter |
| `IncludeTls` | bool | `true` | Include cert-manager TLS certificates |

## Project layout

```text
<ProjectName>/
  chart/
    Chart.yaml                          # Helm chart metadata
    values.yaml                         # All component defaults
    templates/
      _helpers.tpl                      # Naming, labels, selector helpers
      configmap.yaml                    # Shared runtime properties
      serviceaccount.yaml               # ServiceAccount with IAM annotation
      certificate.yaml                  # (optional) cert-manager mTLS
      router/
        statefulset.yaml                # Router StatefulSet
        service.yaml                    # Router headless Service
        configmap.yaml                  # Router runtime properties
      broker/
        statefulset.yaml                # Broker StatefulSet
        service.yaml                    # Broker headless Service
        configmap.yaml                  # Broker runtime properties
      coordinator/
        statefulset.yaml                # Coordinator StatefulSet
        service.yaml                    # Coordinator headless Service
        configmap.yaml                  # Coordinator runtime properties
      overlord/
        statefulset.yaml                # Overlord StatefulSet
        service.yaml                    # Overlord headless Service
        configmap.yaml                  # Overlord runtime properties
      historical/
        statefulset.yaml                # Historical StatefulSet
        service.yaml                    # Historical headless Service
        configmap.yaml                  # Historical runtime properties
      task/
        pod-template.yaml               # K8s-native task pod template
  .env.example                          # Required secrets and config
  .gitignore
  README.md                             # Architecture and production checklist
```

## Pairs with

- [monitoring-stack](../monitoring-stack/) -- Grafana + Prometheus for Druid metrics
- [k8s-deploy](../k8s-deploy/) -- deploy alongside other Kubernetes workloads

## Nests inside

- [monorepo](../monorepo/)
