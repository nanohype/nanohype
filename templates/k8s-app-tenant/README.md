# k8s-app-tenant

Primary scaffolding for a nanohype-org k8s-native application. Produces a Helm chart, ArgoCD ApplicationSet entry, and Platform CR — the three artifacts that make an app a Platform tenant on the `eks-agent-platform` operator.

## What you get

- **Helm chart** in `chart/` with `Chart.yaml`, `values.yaml`, per-env deltas (`values-dev.yaml`, `values-staging.yaml`, `values-production.yaml`), and templates for:
  - `deployment.yaml` — non-root, read-only rootfs, distinct `/healthz` + `/readyz` probes, OTel resource attrs + OTLP wiring (`:4318`, `http/protobuf`), `terminationGracePeriodSeconds` headroom
  - `service.yaml` — ClusterIP
  - `serviceaccount.yaml` — `eks.amazonaws.com/role-arn` rendered from `aws.platformRoleArn` (the landing-zone-owned IRSA role), never inline IAM
  - `networkpolicy.yaml` — default-deny + explicit egress allow-list (DNS + `:443`, IMDS blocked)
  - `externalsecret.yaml` — *(toggle, off by default)* AWS Secrets Manager → k8s Secret via External Secrets Operator, mounted `envFrom`
  - `prometheusrule.yaml` — *(toggle, off by default)* example RED-metric alert
  - `grafana-dashboard.yaml` + `dashboards/<app>.json` — *(toggle, off by default)* sidecar-discovered dashboard
- **ApplicationSet entry** in `gitops/applicationset-entry.yaml` ready to copy into `nanohype/eks-gitops/applicationsets/` (or aks-gitops)
- **Platform CR** in `platform.yaml` — a `Platform` (`platform.nanohype.dev/v1alpha1`) plus its required `BudgetPolicy` (`governance.nanohype.dev/v1alpha1`). The operator reconciles Namespace, ResourceQuota, LimitRange, default-deny NetworkPolicy, ArgoCD AppProject, and the per-Platform IRSA role (scoped to `spec.identity.allowedModelFamilies`); the BudgetPolicy drives the spend kill-switch
- **Skeleton README** documenting how to apply the Platform CR, register the ApplicationSet entry, and roll out new versions

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `AppName` | string | (required) | Kebab-case app name — chart name, namespace, Platform/BudgetPolicy CR name, service account name |
| `Description` | string | `k8s-native Platform tenant` | Short description for Chart.yaml + README |
| `Tenant` | string | (required) | Owning team (drives namespace prefix `tenants-<team>`, AppProject, quotas) |
| `Persona` | string | `generic` | Platform persona — `sales-ops`, `support`, `finance`, `ops`, `founder`, `eng`, `marketing`, `legal`, `generic` |
| `MonthlyUsd` | string | `2500` | Soft monthly Bedrock spend cap (USD); kill-switch at 120% |
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
    dashboards/
      <app>.json                   # Grafana dashboard (loaded by grafana-dashboard.yaml)
    templates/
      deployment.yaml
      service.yaml
      serviceaccount.yaml          # role-arn from aws.platformRoleArn (landing-zone IRSA role)
      networkpolicy.yaml           # default-deny + egress allow-list
      externalsecret.yaml          # toggle: Secrets Manager → k8s Secret (off by default)
      prometheusrule.yaml          # toggle: RED-metric alerts (off by default)
      grafana-dashboard.yaml       # toggle: dashboard ConfigMap (off by default)
      _helpers.tpl
  gitops/
    applicationset-entry.yaml      # copy into nanohype/eks-gitops/applicationsets/
  platform.yaml                    # Platform + BudgetPolicy CRs (apply once during tenant setup)
  README.md                        # how to deploy + iterate
```

The `externalSecret`, `prometheusRule`, and `grafanaDashboard` blocks in `values.yaml` ship **off** so the chart `helm lint`s on a bare cluster without the External Secrets / kube-prometheus-stack CRDs. Flip them on (per-env) once the substrate + instrumentation exist.

## Pairs with

Compose with any of the application templates that produce a container-shipped service:

- `ts-service` / `go-service` — backend services
- `next-app` — frontend
- `mcp-server-ts` / `mcp-server-python` — MCP gateways
- `agentic-loop` — agent-driven workloads (also use `agent-fleet` for the AgentFleet + ModelGateway CRs)

## Nests inside

- `monorepo` — drop the rendered tree at `apps/<app-name>/` or wherever the monorepo's app layout calls for

## Renders against

Designed to work with these repos already in place on the target cluster:

- `nanohype/landing-zone` — provisions the EKS/AKS cluster, ArgoCD, base IAM, KMS keys, and the per-app `<app>-platform` component (IRSA role + Secrets Manager entries)
- `nanohype/eks-gitops` (or `aks-gitops`) — supplies cluster addons (cert-manager, external-secrets, ingress-nginx, observability, Kyverno policies) and the ApplicationSet that picks up `gitops/applicationset-entry.yaml`
- `nanohype/eks-agent-platform` — runs the operator that reconciles your `platform.yaml`

If any of these are missing on the target cluster, the rendered app's `platform.yaml` won't reconcile and the ApplicationSet entry won't have a parent to register against.

## How to roll out

1. Render: `helm template chart/ -f chart/values-dev.yaml` (sanity)
2. Apply the Platform + BudgetPolicy CRs: `kubectl apply -f platform.yaml`
3. Wait for `Platform.status.phase = Ready`
4. Set `aws.platformRoleArn` (and any per-env secret paths) in `values-{env}.yaml` from the landing-zone `<app>-platform` component outputs
5. Copy `gitops/applicationset-entry.yaml` into the gitops repo as a new entry in the appropriate ApplicationSet
6. ArgoCD picks up the entry on next sync and rolls out the chart
7. For new image tags: update `values-{env}.yaml` `image.tag`, commit, ArgoCD reconciles
