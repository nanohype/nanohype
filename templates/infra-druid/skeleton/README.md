# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This Helm chart deploys a complete [Apache Druid](https://druid.apache.org/) __DRUID_VERSION__ OLAP cluster on Kubernetes with six services:

| Service | Role | Port |
|---|---|---|
| **Router** | HTTP gateway, routes queries to brokers | 9088 |
| **Broker** | Query federation, merges results from historicals | 8282 |
| **Coordinator** | Segment management, data balancing, retention | 8281 |
| **Overlord** | Task management, ingestion coordination | 8290 |
| **Historical** | Serves immutable segments from deep storage | 8283 |
| **Task** | K8s-native task pods launched by the overlord | 8091 |

Key design decisions:

- **Kubernetes-native discovery** -- no ZooKeeper dependency; uses `druid.discovery.type=k8s`
- **K8s-native task execution** -- overlord launches task pods directly via the Kubernetes API
- **__METADATA_DRIVER__** for metadata storage
- **__DEEP_STORAGE_TYPE__** for deep storage (segments and index logs)
- **Headless Services** for stable pod DNS required by K8s discovery

## Prerequisites

- Kubernetes cluster (1.27+)
- [Helm](https://helm.sh/) >= 3.0
- A __METADATA_DRIVER__ database accessible from the cluster
- __DEEP_STORAGE_TYPE__ bucket(s) for deep storage and index logs
- K8s Secret with metadata DB credentials (see `.env.example`)

## Getting Started

### Install

```bash
# Create namespace
kubectl create namespace druid

# Create the metadata secret
kubectl create secret generic druid-metadata \
  --namespace druid \
  --from-literal=username=druid \
  --from-literal=password=changeme \
  --from-literal=uri=jdbc:__METADATA_DRIVER__://db-host:5432/druid

# Install the chart
helm install __PROJECT_NAME__ ./chart --namespace druid
```

### Upgrade

```bash
helm upgrade __PROJECT_NAME__ ./chart --namespace druid
```

### Uninstall

```bash
helm uninstall __PROJECT_NAME__ --namespace druid
```

## Configuration

All component settings are in `chart/values.yaml`. Key sections:

- **image** -- Druid container image and tag
- **securityContext** -- Pod security (runAsNonRoot, fsGroup)
- **secrets** -- K8s Secret names for metadata, admin, and system credentials
- **deepStorage** -- Bucket names for segments and index logs
- **router/broker/coordinator/overlord/historical/task** -- Per-component replicas, resources, runtime properties, and JVM settings

### Scaling

```bash
# Scale historicals to 3 replicas
helm upgrade __PROJECT_NAME__ ./chart --namespace druid \
  --set historical.replicas=3

# Increase broker memory
helm upgrade __PROJECT_NAME__ ./chart --namespace druid \
  --set broker.resources.limits.memory=16Gi \
  --set broker.jvm="-Xms8g\n-Xmx8g\n-XX:MaxDirectMemorySize=4g"
```

## Production Readiness

- [ ] Configure metadata storage credentials in a K8s Secret
- [ ] Create deep storage bucket(s) with appropriate IAM permissions
- [ ] Set ServiceAccount annotation for IRSA or workload identity
- [ ] Tune JVM heap and direct memory per component for your workload
- [ ] Set historical `storage.size` to match `server.maxSize` in runtime properties
- [ ] Scale historicals based on data volume (1 replica per ~50GB active segments)
- [ ] Enable TLS (cert-manager Certificate) for internal mTLS between services
- [ ] Configure Prometheus scraping for Druid metrics on port 9000
- [ ] Set resource requests/limits based on cluster capacity and workload profile
- [ ] Configure retention rules via the Coordinator console
- [ ] Back up metadata database regularly
- [ ] Set up PodDisruptionBudgets for coordinator and overlord (single-replica services)
- [ ] Test rolling upgrades with `helm upgrade --set image.tag=<new-version>`

## License

See [LICENSE](LICENSE) for details.
