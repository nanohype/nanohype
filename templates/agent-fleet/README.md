# agent-fleet

The AI-workload composite scaffolding for nanohype-org apps. Produces an `AgentFleet` CR and a `ModelGateway` CR ready to apply against an `eks-agent-platform` cluster — these layer on top of a Platform tenant (rendered separately via `k8s-app-tenant`).

## What you get

- **`modelgateway.yaml`** — `ModelGateway` (`agents.nanohype.dev/v1alpha1`) declaring one or more named agentgateway routes, each resolving a Bedrock `modelFamily` + `modelId` (optionally via a cross-region inference profile), a per-route requests-per-minute rate limit, and an optional Guardrail reference
- **`agentfleet.yaml`** — `AgentFleet` (`agents.nanohype.dev/v1alpha1`) composing one or more kagent `Agent`s (each bound to a gateway route via `modelRoute`) behind a KEDA `ScaledObject`, with an optional DRA accelerator claim
- **`README.md`** documenting the apply order (Platform first, then ModelGateway, then AgentFleet) and the OTel attributes the AI workload emits

Both CRs derive their namespace, ownership, and IRSA from the Platform via `spec.platformRef` — neither carries a tenant or identity of its own.

## Variables

| Variable      | Type   | Default                       | Description                                                                                                                       |
| ------------- | ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `FleetName`   | string | (required)                    | AgentFleet CR name + label selector                                                                                               |
| `Tenant`      | string | (required)                    | Owning team — sets the `tenants-<team>` namespace, matching the Platform                                                          |
| `AppName`     | string | (required)                    | Companion Platform tenant name (matches `k8s-app-tenant`'s `AppName`); used as `spec.platformRef.name`                            |
| `ModelFamily` | string | `anthropic`                   | Bedrock model family for the gateway route — `anthropic`, `meta`, `mistral`, `cohere`, `amazon-titan`, `amazon-nova`, `stability` |
| `ModelId`     | string | `anthropic.claude-sonnet-4-6` | Bedrock model ID (or inference-profile ID) for the gateway route                                                                  |
| `RouteName`   | string | (required)                    | ModelGateway route name referenced by each `AgentFleet.spec.agents[].modelRoute`                                                  |
| `Compute`     | string | `none`                        | Accelerator — `none` (CPU), `nvidia-l40s`, `nvidia-h100`, `neuron`. Non-`none` references an `AcceleratorClaim` CR by name        |

## Project layout

```text
<app>/
  modelgateway.yaml                # ModelGateway CR (routes + rate limits + guardrail)
  agentfleet.yaml                  # AgentFleet CR (kagent agents + KEDA scaler)
  README.md                        # apply order + OTel guidance
```

Drop these alongside the `k8s-app-tenant`-produced `platform.yaml`.

## Pairs with

- `k8s-app-tenant` — the Platform tenant boundary this composite lives inside. The Platform CR's `spec.identity.allowedModelFamilies` must include this fleet's `ModelFamily` so the per-Platform IRSA role can invoke it
- `agentic-loop` — the application skeleton for the agent code itself
- `mcp-server-ts` / `mcp-server-python` — MCP server scaffolds that often pair with an AgentFleet

## Nests inside

- `monorepo`

## Renders against

Requires the target cluster to have:

- `nanohype/eks-agent-platform` operator running (provides the `AgentFleet`, `ModelGateway` CRDs)
- `kagent` + `agentgateway` installed via `nanohype/eks-gitops` `addons/argo-platform/`
- For `nvidia-*` Compute: NVIDIA DRA driver from `eks-gitops/addons/operations/` and a matching `AcceleratorClaim`/`DeviceClass` provisioned by `landing-zone/components/aws/accelerator-pools`
- For `neuron` Compute: AWS Neuron device plugin from `eks-gitops/addons/operations/`

## Apply order

1. Platform CR (from `k8s-app-tenant`) — `kubectl apply -f platform.yaml`, wait for `status.phase: Ready`
2. ModelGateway CR — `kubectl apply -f modelgateway.yaml`, wait for `status.phase: Ready`
3. AgentFleet CR — `kubectl apply -f agentfleet.yaml`, wait for `status.phase: Ready`

On AgentFleet reconcile the operator wires each kagent agent to its gateway route and creates a KEDA `ScaledObject` from `spec.scaling` — an SQS-depth trigger when `queueUrl` is set, CPU utilization otherwise.

## OTel resource attributes

The `k8s-app-tenant` chart wires `agents.tenant` and `agents.platform` onto every pod. For AI workloads the agentgateway runtime additionally tags each Bedrock invocation span with `agents.model_family` and `agents.model_id` (resolved from the route the agent calls), which the cluster-level Collector uses for per-invocation cost attribution on the finance / ops Grafana dashboards. No extra fields are needed in the AgentFleet CR.
