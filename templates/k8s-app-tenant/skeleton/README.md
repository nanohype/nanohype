# __APP_NAME__

__DESCRIPTION__

A Platform tenant on the [`nanohype/eks-agent-platform`](https://github.com/nanohype/eks-agent-platform) operator. Owned by team `__TENANT__`.

## Layout

```
chart/
  Chart.yaml
  values.yaml                    # base values (all environments)
  values-dev.yaml                # dev delta
  values-staging.yaml            # staging delta
  values-production.yaml         # prod delta
  templates/                     # deployment, service, serviceaccount, networkpolicy
gitops/
  applicationset-entry.yaml      # register with __GITOPS_REPO__
platform.yaml                    # Platform CR — apply once
```

## Initial setup (per cluster, one-time)

1. **Apply the Platform CR**:
   ```sh
   kubectl apply -f platform.yaml
   ```
2. **Wait for reconciliation**:
   ```sh
   kubectl wait --for=jsonpath='{.status.phase}'=Ready \
     platform/__APP_NAME__ -n tenants-__TENANT__ --timeout=60s
   ```
3. **Register the ApplicationSet entry** — copy `gitops/applicationset-entry.yaml` into [`__GITOPS_REPO__/applicationsets/`](https://github.com/__GITOPS_REPO__/tree/main/applicationsets), commit, push. ArgoCD picks it up on next reconcile.

## Iterating

- **Code change** → bump image tag in `values-<env>.yaml` → commit → ArgoCD reconciles.
- **Chart change** → edit `chart/templates/*.yaml` → render locally with `helm template chart/ -f chart/values-dev.yaml` → commit.
- **New egress** → add entry to `chart/values.yaml` `networkPolicy.egress` → render → commit.
- **New IRSA policy** → edit `platform.yaml` `spec.irsa.policies` → reapply → operator reconciles the role.

## What lives where (don't put it in the wrong place)

- **Cloud substrate** (KMS keys, VPC endpoints, IAM patterns) → [`nanohype/landing-zone`](https://github.com/nanohype/landing-zone), NOT this chart.
- **Cluster addons** (ingress controller, cert-manager, External Secrets, observability) → `__GITOPS_REPO__`, NOT this chart.
- **App config** → this chart's `values.yaml` + per-env deltas.
- **Per-tenant IAM** → `platform.yaml` `spec.irsa.policies`. The reconciler creates the role.

## Local development

Run against [`nanohype/kx`](https://github.com/nanohype/kx) (local kind cluster mirroring eks-gitops):

```sh
cd ~/codes/kx && task up
kubectl apply -f platform.yaml
helm install __APP_NAME__ chart/ -f chart/values-dev.yaml
```
