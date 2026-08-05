# agent-fleet

The AI-workload composite scaffolding for nanohype-org apps. Produces an `AgentFleet` CR and a `ModelGateway` CR ready to apply against an `eks-agent-platform` cluster — these layer on top of a Platform tenant (rendered separately via `k8s-app-tenant`).

## What you get

- **`modelgateway.yaml`** — `ModelGateway` (`agents.nanohype.dev/v1alpha1`) declaring one or more named routes, each resolving a Bedrock `modelFamily` + `modelId` (optionally via a cross-region inference profile), the wire format callers speak to it, a per-route requests-per-minute rate limit, and an optional Guardrail reference. The operator renders the set as Envoy AI Gateway resources and publishes each route's resolved format and base URL on `status.routes`
- **`agentfleet.yaml`** — `AgentFleet` (`agents.nanohype.dev/v1alpha1`) declaring one or more agents, each an image bound to a gateway route via `modelRoute`, which the operator runs as a Deployment behind a KEDA `ScaledObject`
- **`README.md`** documenting the apply order (Platform first, then ModelGateway, then AgentFleet) and the OTel attributes the AI workload emits

Both CRs derive their namespace, ownership, and identity from the Platform via `spec.platformRef` — neither carries a tenant or identity of its own.

## Variables

| Variable      | Type   | Default                       | Description                                                                                                                       |
| ------------- | ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `FleetName`   | string | (required)                    | AgentFleet CR name + label selector                                                                                               |
| `Tenant`      | string | (required)                    | Owning team — sets the `tenants-<team>` namespace, matching the Platform                                                          |
| `AppName`     | string | (required)                    | Companion Platform tenant name (matches `k8s-app-tenant`'s `AppName`); used as `spec.platformRef.name`                            |
| `ModelFamily` | string | `anthropic`                   | Bedrock model family for the gateway route — `anthropic`, `meta`, `mistral`, `cohere`, `amazon-titan`, `amazon-nova`, `stability` |
| `ModelId`     | string | `us.anthropic.claude-sonnet-5` | Bedrock model ID (or inference-profile ID) for the gateway route                                                                  |
| `RouteName`   | string | (required)                    | ModelGateway route name referenced by each `AgentFleet.spec.agents[].modelRoute`                                                  |
| `AgentImage`  | string | (required)                    | Container image each agent runs. The operator runs it as a Deployment, so the agent framework is whatever the image carries       |

## Project layout

```text
<app>/
  modelgateway.yaml                # ModelGateway CR (routes + rate limits + guardrail)
  agentfleet.yaml                  # AgentFleet CR (a Deployment per agent + KEDA scaler)
  README.md                        # apply order + OTel guidance
```

Drop these alongside the `k8s-app-tenant`-produced `platform.yaml`.

## Pairs with

- `k8s-app-tenant` — the Platform tenant boundary this composite lives inside. The Platform CR's `spec.identity.allowedModelFamilies` must include this fleet's `ModelFamily` so the per-Platform IAM role can invoke it
- `agentic-loop` — the application skeleton for the agent code itself
- `mcp-server-ts` / `mcp-server-python` — MCP server scaffolds that often pair with an AgentFleet

## Nests inside

- `monorepo`

## Renders against

Requires the target cluster to have:

- `nanohype/eks-agent-platform` operator running (provides the `AgentFleet`, `ModelGateway` CRDs)
- Envoy Gateway and Envoy AI Gateway installed via `nanohype/eks-gitops` — the operator renders route resources into them
- KEDA, for `spec.scaling`

## Apply order

1. Platform CR (from `k8s-app-tenant`) — `kubectl apply -f platform.yaml`, wait for `status.phase: Ready`
2. ModelGateway CR — `kubectl apply -f modelgateway.yaml`, wait for `status.phase: Ready`
3. AgentFleet CR — `kubectl apply -f agentfleet.yaml`, wait for `status.phase: Ready`

On AgentFleet reconcile the operator creates a Deployment per agent, wires each to the endpoint of the gateway route it names, and creates a KEDA `ScaledObject` from `spec.scaling` — an SQS-depth trigger when `queueUrl` is set, CPU utilization otherwise.

## OTel resource attributes

The `k8s-app-tenant` chart wires `agents.tenant` and `agents.platform` onto every pod. For AI workloads the gateway additionally tags each Bedrock invocation span with `agents.model_family` and `agents.model_id` (resolved from the route the agent calls), which the cluster-level Collector uses for per-invocation cost attribution on the finance / ops Grafana dashboards. No extra fields are needed in the AgentFleet CR.
