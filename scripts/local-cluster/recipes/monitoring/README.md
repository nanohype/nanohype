# monitoring — kind cluster sized for the monitoring-stack template

Single-node kind cluster with a pre-created `monitoring` namespace. Intentionally minimal today — the `monitoring-stack` template ships its own Prometheus Operator CRDs via its Helm chart, so the cluster starts empty.

When `monitoring-stack` hardens (tracked as future work; the template owner mentioned this is upcoming), this recipe's `up.sh` will gain operator installation so validations can exercise the full CRD surface without re-applying the whole chart. The README of `monitoring-stack` will be the source of truth for what's needed.

## Footprint

- Cluster node: ~1 GB RAM
- Idle total: ~1 GB RAM
- ~2 min cold boot

## Prerequisites

- [Docker](https://www.docker.com/) running
- [kind](https://kind.sigs.k8s.io/) — `brew install kind`
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — `brew install kubectl`

## Usage

```sh
make -C scripts/local-cluster up RECIPE=monitoring
make -C scripts/local-cluster status RECIPE=monitoring
make -C scripts/local-cluster validate DIR=/tmp/monitoring-render RECIPE=monitoring
make -C scripts/local-cluster down RECIPE=monitoring
```

## Host port mappings

- `localhost:9090` — NodePort 30090 (Prometheus)
- `localhost:3000` — NodePort 30300 (Grafana)
- `localhost:3100` — NodePort 30310 (Loki)

Override in `kind-config.yaml` if any of those clash locally.
