# agent-fleet

The AI-workload composite scaffolding for nanohype-org apps. Produces an `AgentFleet` CR and a `ModelGateway` CR ready to apply against an `eks-agent-platform` cluster — these layer on top of a Platform tenant (rendered separately via `k8s-app-tenant`).

## What you get

- **`agentfleet.yaml`** — `AgentFleet` (`agents.stxkxs.io/v1alpha1`) composing kagent `Agent` + `ModelConfig` + KEDA `ScaledObject`, with optional DRA accelerator class for NVIDIA/Neuron workloads
- **`modelgateway.yaml`** — `ModelGateway` declaring the agentgateway `Route`, Bedrock model ID resolution, Bedrock Guardrails attachment point, and per-route rate limits
- **`README.md`** documenting the apply order (Platform first, then ModelGateway, then AgentFleet) and the OTel attributes the AI workload must emit

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `FleetName` | string | (required) | AgentFleet CR name + label selector |
| `Tenant` | string | (required) | Owning team — must match the Platform CR's `spec.tenant` |
| `AppName` | string | (required) | Companion Platform tenant name (matches `k8s-app-tenant`'s `AppName`) |
| `ModelFamily` | string | `anthropic` | Bedrock model family — drives `ModelConfig` + OTel tagging |
| `ModelId` | string | `anthropic.claude-sonnet-4-6` | Full Bedrock model ID |
| `RouteName` | string | (required) | ModelGateway route name referenced by `AgentFleet.spec.modelRoute` |
| `ScaleTrigger` | string | `cpu` | KEDA scaler — `sqs`, `cpu`, or `cron` |
| `Compute` | string | `none` | Accelerator — `none`, `nvidia-l40s`, `nvidia-h100`, `neuron` |

## Project layout

```text
<app>/
  agentfleet.yaml                  # AgentFleet CR (apply after Platform is Ready)
  modelgateway.yaml                # ModelGateway CR (route + Guardrails + rate limits)
  README.md                        # apply order + OTel guidance
```

Drop these alongside the `k8s-app-tenant`-produced `platform.yaml`.

## Pairs with

- `k8s-app-tenant` — the Platform tenant boundary this composite lives inside. The Platform CR's IRSA role gains the `bedrock-invoke` policy when used with this template
- `agentic-loop` — the application skeleton for the agent code itself
- `mcp-server-ts` / `mcp-server-python` — MCP server scaffolds that often pair with an AgentFleet

## Nests inside

- `monorepo`

## Renders against

Requires the target cluster to have:

- `nanohype/eks-agent-platform` operator running (provides `AgentFleet`, `ModelGateway` CRDs)
- `kagent` + `agentgateway` installed via `nanohype/eks-gitops` `addons/argo-platform/`
- For `nvidia-*` Compute: NVIDIA DRA driver from `eks-gitops/addons/operations/` and a matching `DeviceClass` provisioned by `landing-zone/components/aws/accelerator-pools`
- For `neuron` Compute: AWS Neuron device plugin from `eks-gitops/addons/operations/`

## Apply order

1. Platform CR (from `k8s-app-tenant`) — `kubectl apply -f platform.yaml`, wait for `Ready`
2. ModelGateway CR — `kubectl apply -f modelgateway.yaml`, wait for `Programmed`
3. AgentFleet CR — `kubectl apply -f agentfleet.yaml`, wait for `Ready`

The operator wires kagent agents to the agentgateway route on AgentFleet reconcile; pods are KEDA-scaled per `ScaleTrigger`.

## Required OTel resource attributes

The agent's OTel SDK must set these (`k8s-app-tenant` chart already wires `agents.tenant` and `agents.platform`; this template adds the AI ones):

- `agents.model_family: __MODEL_FAMILY__`
- `agents.model_id: __MODEL_ID__`

Cluster-level Collector tags Bedrock invocation spans + per-invocation cost from these attributes for the finance / ops Grafana dashboards.
