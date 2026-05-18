# k8s-app-tenant

Primary scaffolding for a nanohype-org k8s-native application. Produces a Helm chart, ArgoCD ApplicationSet entry, and Platform CR — the three artifacts that make an app a Platform tenant on the `eks-agent-platform` operator.

## What you get

- **Helm chart** in `chart/` with `Chart.yaml`, `values.yaml`, per-env deltas (`values-dev.yaml`, `values-staging.yaml`, `values-production.yaml`), and templates for Deployment, Service, ServiceAccount (IRSA-annotated by the Platform reconciler), and NetworkPolicy (default-deny + explicit egress allow-list)
- **ApplicationSet entry** in `gitops/applicationset-entry.yaml` ready to copy into `nanohype/eks-gitops/applicationsets/` (or aks-gitops)
- **Platform CR** in `platform.yaml` (`agents.stxkxs.io/v1alpha1`) declaring the tenant boundary — the operator reconciles Namespace, ResourceQuota, default-deny NetworkPolicy, ArgoCD AppProject, IRSA role, KMS grants, and S3 bucket policy from this CR
- **Skeleton README** documenting how to apply the Platform CR, register the ApplicationSet entry, and roll out new versions

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `AppName` | string | (required) | Kebab-case app name — used as chart name, namespace, Platform CR name, service account name |
| `Description` | string | `k8s-native Platform tenant` | Short description for Chart.yaml + README |
| `Tenant` | string | (required) | Owning team (drives namespace prefix `tenants-<team>`, AppProject, quotas) |
| `Image` | string | (required) | Container image base (no tag) |
| `Port` | string | `8080` | Container port |
| `GitopsRepo` | string | `nanohype/eks-gitops` | Target gitops repo for the ApplicationSet entry |
| `SyncWave` | string | `100` | ArgoCD sync wave (apps land after addons which use waves 0–52) |

## Project layout

```text
<app>/
  chart/
    Chart.yaml
    values.yaml                    # base values for all environments
    values-dev.yaml                # dev delta only
    values-staging.yaml            # staging delta only
    values-production.yaml         # prod delta only
    templates/
      deployment.yaml
      service.yaml
      serviceaccount.yaml          # eks.amazonaws.com/role-arn filled by Platform reconciler
      networkpolicy.yaml           # default-deny + egress allow-list
      _helpers.tpl
  gitops/
    applicationset-entry.yaml      # copy into nanohype/eks-gitops/applicationsets/
  platform.yaml                    # Platform CR (apply once during tenant setup)
  README.md                        # how to deploy + iterate
```

## Pairs with

Compose with any of the application templates that produce a container-shipped service:

- `ts-service` / `go-service` — backend services
- `next-app` — frontend
- `mcp-server-ts` / `mcp-server-python` — MCP gateways
- `agentic-loop` — agent-driven workloads (also use `agent-fleet` for the AgentFleet CR)

## Nests inside

- `monorepo` — drop the rendered tree at `apps/<app-name>/` or wherever the monorepo's app layout calls for

## Renders against

Designed to work with these repos already in place on the target cluster:

- `nanohype/landing-zone` — provisions the EKS/AKS cluster, ArgoCD, base IAM, KMS keys
- `nanohype/eks-gitops` (or `aks-gitops`) — supplies cluster addons (cert-manager, external-secrets, ingress-nginx, observability, Kyverno policies) and the ApplicationSet that picks up `gitops/applicationset-entry.yaml`
- `nanohype/eks-agent-platform` — runs the operator that reconciles your `platform.yaml`

If any of these are missing on the target cluster, the rendered app's `platform.yaml` won't reconcile and the ApplicationSet entry won't have a parent to register against.

## How to roll out

1. Render: `helm template chart/ -f chart/values-dev.yaml` (sanity)
2. Apply Platform CR: `kubectl apply -f platform.yaml`
3. Wait for `Platform.status.phase = Ready`
4. Copy `gitops/applicationset-entry.yaml` into the gitops repo as a new entry in the appropriate ApplicationSet
5. ArgoCD picks up the entry on next sync and rolls out the chart
6. For new image tags: update `values-{env}.yaml` `image.tag`, commit, ArgoCD reconciles
