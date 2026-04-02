# k8s-deploy

Kubernetes deployment with raw manifests and an optional Helm chart. Production-grade defaults with resource limits, health probes, non-root security context, and auto-scaling.

## What you get

- Raw manifests: Deployment, Service, ConfigMap, Namespace, ServiceAccount
- Non-root security context with read-only filesystem and dropped capabilities
- Liveness and readiness probes on configurable health endpoints
- Resource requests and limits for CPU and memory
- RollingUpdate strategy with zero-downtime deploys
- Optional Ingress with TLS termination (nginx ingress controller)
- Optional HorizontalPodAutoscaler with CPU and memory scaling
- Optional Helm chart producing the same resources, fully parameterized
- Optional GitHub Actions workflow for build, push, and deploy

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | -- | Kebab-case project name |
| `Description` | string | no | `Kubernetes deployment` | Project description |
| `Namespace` | string | no | `default` | Kubernetes namespace |
| `Replicas` | string | no | `2` | Replica count |
| `IncludeIngress` | bool | no | `true` | Include Ingress resource |
| `IncludeHpa` | bool | no | `true` | Include HorizontalPodAutoscaler |
| `IncludeHelm` | bool | no | `true` | Include Helm chart |
| `IncludeCi` | bool | no | `true` | Include GitHub Actions workflow |

## Project layout

```text
<ProjectName>/
  k8s/
    namespace.yaml          # Namespace definition
    configmap.yaml          # Application configuration
    deployment.yaml         # Deployment + ServiceAccount
    service.yaml            # ClusterIP Service
    ingress.yaml            # (optional) Ingress with TLS
    hpa.yaml                # (optional) HorizontalPodAutoscaler
  chart/                    # (optional) Helm chart
    Chart.yaml              # Chart metadata
    values.yaml             # Default values
    templates/
      _helpers.tpl          # Template helpers
      configmap.yaml        # ConfigMap template
      deployment.yaml       # Deployment template
      hpa.yaml              # HPA template
      ingress.yaml          # Ingress template
      service.yaml          # Service template
      serviceaccount.yaml   # ServiceAccount template
  .github/
    workflows/
      deploy.yml            # (optional) CI/CD deploy on push to main
```

## Pairs with

- [go-service](../go-service/) -- deploy Go HTTP services
- [ts-service](../ts-service/) -- deploy TypeScript API services
- [go-cli](../go-cli/) -- deploy CLI tools as containers

## Nests inside

- [monorepo](../monorepo/)
