# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

Kubernetes deployment with the following resources:

- **Namespace:** `__NAMESPACE__`
- **Replicas:** __REPLICAS__
- **Health checks:** Liveness at `/healthz`, readiness at `/readyz`
- **Security:** Non-root user, read-only filesystem, all capabilities dropped

## Prerequisites

- [kubectl](https://kubernetes.io/docs/tasks/tools/) -- Kubernetes CLI
- [helm](https://helm.sh/docs/intro/install/) -- Helm CLI (if using the Helm chart)
- Access to a Kubernetes cluster

## Deploy with raw manifests

```bash
# Create the namespace (if not using default)
kubectl apply -f k8s/namespace.yaml

# Apply all resources
kubectl apply -f k8s/

# Check rollout status
kubectl rollout status deployment/__PROJECT_NAME__ -n __NAMESPACE__
```

## Deploy with Helm

```bash
# Install or upgrade the release
helm upgrade --install __PROJECT_NAME__ ./chart \
  --namespace __NAMESPACE__ \
  --create-namespace

# Override values
helm upgrade --install __PROJECT_NAME__ ./chart \
  --namespace __NAMESPACE__ \
  --set replicaCount=3 \
  --set image.tag=v1.0.0
```

## Useful commands

| Command | Description |
|---------|-------------|
| `kubectl get pods -n __NAMESPACE__` | List running pods |
| `kubectl logs -f deploy/__PROJECT_NAME__ -n __NAMESPACE__` | Stream logs |
| `kubectl describe deploy/__PROJECT_NAME__ -n __NAMESPACE__` | Inspect deployment |
| `kubectl port-forward svc/__PROJECT_NAME__ 8080:80 -n __NAMESPACE__` | Port-forward locally |
| `helm list -n __NAMESPACE__` | List Helm releases |
| `helm history __PROJECT_NAME__ -n __NAMESPACE__` | Release history |

## Project Structure

```
k8s/
  namespace.yaml          # Namespace definition
  configmap.yaml          # Application configuration
  deployment.yaml         # Deployment + ServiceAccount
  service.yaml            # ClusterIP Service
  ingress.yaml            # Ingress resource (optional)
  hpa.yaml                # HorizontalPodAutoscaler (optional)
chart/
  Chart.yaml              # Helm chart metadata
  values.yaml             # Default chart values
  templates/              # Helm templates
.github/
  workflows/
    deploy.yml            # CI/CD deploy workflow (optional)
```
