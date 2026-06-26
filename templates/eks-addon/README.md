# eks-addon

Scaffolds a new Helm-based addon into [`nanohype/eks-gitops`](https://github.com/nanohype/eks-gitops). Follows the base + delta-only env values pattern eks-gitops standardizes on.

The Kustomize-based addon variant (used by `storage-classes`, `priority-classes`, `karpenter-resources`) needs a different file layout and is not covered by this template — copy from an existing Kustomize addon directly.

## What you get

- `addons/<category>/<name>/values.yaml` — base Helm values (all environments) — comments call out what to override
- `addons/<category>/<name>/values-dev.yaml` — dev delta only
- `addons/<category>/<name>/values-staging.yaml` — staging delta only
- `addons/<category>/<name>/values-production.yaml` — prod delta only

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `AddonName` | string | (required) | Kebab-case addon name |
| `Category` | string | `operations` | `bootstrap`, `networking`, `security`, `observability`, `operations`, `argo-platform` |
| `ChartRepo` | string | (required) | Upstream Helm repo URL |
| `ChartName` | string | (required) | Upstream chart name |
| `ChartVersion` | string | (required) | Pinned chart version (never floating — look up via `helm search repo`) |
| `SyncWave` | string | `40` | ArgoCD sync wave |

## Sync waves (eks-gitops convention)

| Category | Wave range |
|---|---|
| `bootstrap` | 0, 2 |
| `networking` | 1 |
| `karpenter` (under operations) | 5 |
| `security` | 10–12 |
| `policies` (under security) | 20–21 |
| `observability` | 30–33 |
| `operations` | 40–44 |
| `argo-platform` | 50–52 |

Apps land at wave ≥100 (handled by `k8s-app-tenant`).

## Project layout

```text
eks-gitops/
  addons/
    __CATEGORY__/
      __ADDON_NAME__/
        values.yaml                  # base
        values-dev.yaml              # dev delta
        values-staging.yaml          # staging delta
        values-production.yaml       # prod delta
```

## Pairs with

- `landing-zone-component` — when the addon depends on cloud-substrate the component provisions (KMS key, IAM role for IRSA, S3 bucket, etc.)

## Nests inside

- `monorepo` (the gitops repo itself is the monorepo target — drop files at the matching paths)

## After scaffolding

1. Render placeholders into the actual gitops checkout
2. Edit `values.yaml` to set sensible cluster-wide defaults; trim env-specific deltas down to only what differs from base (per the eks-gitops "no full copies" rule)
3. Add an entry referencing the new addon in the appropriate ApplicationSet under `applicationsets/` (e.g., `applicationsets/addons-<category>-helm.yaml`)
4. Validate: `task validate` (runs yamllint + kustomize build on all environments)
5. Open a PR; CI runs `lint → validate per environment → PR summary`

## Conventions

Inherited from eks-gitops CLAUDE.md:

- Pin chart versions explicitly — `helm search repo <chart>` at scaffold time
- Per-env values files contain ONLY deltas from base — never full copies
- ApplicationSet `valueFiles` reference `$values/{{ .path }}/values.yaml` + `values-{{ environment }}.yaml`
- Cluster secret labels (`environment`, `provider`) drive environment selection in the matrix generator
