# __FLEET_NAME__

AI workload composite for the `__APP_NAME__` Platform tenant. Composes kagent agents on top of a Bedrock-backed ModelGateway route, scaled by KEDA per the trigger configured below.

## Files

- `modelgateway.yaml` — the ModelGateway route + Bedrock Guardrails + rate limits
- `agentfleet.yaml` — the AgentFleet CR (kagent Agent + ModelConfig + KEDA scaler)

## Apply order

1. Platform CR (from `k8s-app-tenant`) — `kubectl apply -f platform.yaml` (one level up); wait for `Ready`
2. ModelGateway CR: `kubectl apply -f modelgateway.yaml`; wait for `Programmed`
3. AgentFleet CR: `kubectl apply -f agentfleet.yaml`; wait for `Ready`

## Updating

- Change model family/id → edit `agentfleet.yaml` + `modelgateway.yaml`, reapply
- Change scaling → edit `agentfleet.yaml` `spec.scaling`, reapply
- Add a new agent persona → add an entry under `agentfleet.yaml` `spec.agents[]`
- Tighten rate limits → edit `modelgateway.yaml` `spec.routes[].rateLimit`

## IRSA additions

Make sure the Platform CR's `spec.irsa.policies` includes a `bedrock-invoke` policy
ARN (managed or inline). The agent pod's IRSA role assumes this to talk to Bedrock
via the agentgateway. Add or update via `platform.yaml` then `kubectl apply` — the
operator will reconcile the role automatically.

## Bedrock Guardrails

Until a guardrail is provisioned in landing-zone's `bedrock-guardrails` component,
leave the `spec.routes[].guardrails` block commented out in `modelgateway.yaml`.
Once provisioned, uncomment and set `guardrailIdentifier` + `guardrailVersion` to
the values returned by `tofu output -raw <guardrail-name>_id`.

## DRA accelerator

If `Compute` is `nvidia-*` or `neuron`, the operator creates a `ResourceClaimTemplate`
against a `DeviceClass`. Confirm the matching DeviceClass exists in the cluster (it's
provisioned by `landing-zone/components/aws/accelerator-pools`). If absent, the
AgentFleet stays `Pending` indefinitely.
