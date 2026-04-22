# istio — kind cluster with the Istio demo profile

Single-node kind cluster with Istio's demo profile installed and an `apps` namespace pre-labeled for sidecar injection. Sized to validate manifests from `k8s-deploy`, `istio-policy`, and any composite that stacks them.

## Footprint

- Cluster node: ~1 GB RAM
- Istio control plane (istiod + demo ingress/egress gateways): ~2.5 GB RAM
- Total idle: ~3.5–4 GB RAM, ~3–5 min cold boot

Teardown reclaims everything — kind clusters leave no trace on the host.

## Contents

| Component | Purpose |
|---|---|
| kind control-plane | Kubernetes API server + kubelet |
| `istio-system` namespace | istiod + ingress/egress gateways (demo profile) |
| `apps` namespace | Where to apply workload + policy manifests; sidecar injection enabled |
| Port mappings | host `8081` → node `30080`, host `8443` → node `30443` — available for NodePort-style demos |

## Prerequisites

- [Docker](https://www.docker.com/) running
- [kind](https://kind.sigs.k8s.io/) — `brew install kind`
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — `brew install kubectl`
- [istioctl](https://istio.io/latest/docs/setup/getting-started/#download) — `brew install istioctl`

## Usage

From the repo root:

```sh
make -C scripts/local-cluster up FLAVOR=istio       # idempotent
make -C scripts/local-cluster status FLAVOR=istio
make -C scripts/local-cluster validate DIR=/tmp/ias-render
make -C scripts/local-cluster down FLAVOR=istio
```

## What `validate` does

Walks the rendered directory, skips Helm chart templates (Go template syntax isn't kubectl-parseable), runs `kubectl apply --dry-run=server` on every YAML against the current cluster, and then runs `istioctl analyze` on any file whose `apiVersion` contains `istio.io`. Server-side dry-run means resources are validated against actually-installed CRDs, so Istio types are fully checked.

## Ports on the host

- `localhost:8081` — NodePort 30080 (HTTP)
- `localhost:8443` — NodePort 30443 (HTTPS)

Change in `kind-config.yaml` if they clash with something running on your machine.
