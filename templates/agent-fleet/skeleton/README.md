# __FLEET_NAME__

AI workload composite for the `__APP_NAME__` Platform tenant. Composes kagent agents on top of a Bedrock-backed ModelGateway route, scaled by KEDA. Namespace, ownership, and IRSA come from the Platform via `spec.platformRef`.

## Files

- `modelgateway.yaml` — the ModelGateway route(s) + Bedrock model resolution + rate limit + optional Guardrail
- `agentfleet.yaml` — the AgentFleet CR (kagent Agent + ModelConfig + KEDA scaler)

## Apply order

1. Platform CR (from `k8s-app-tenant`) — `kubectl apply -f platform.yaml` (one level up); wait for `status.phase: Ready`
2. ModelGateway CR: `kubectl apply -f modelgateway.yaml`; wait for `status.phase: Ready`
3. AgentFleet CR: `kubectl apply -f agentfleet.yaml`; wait for `status.phase: Ready`

## Updating

- Change the model → edit `modelgateway.yaml` `spec.routes[].{modelFamily,modelId}`, reapply
- Change scaling → edit `agentfleet.yaml` `spec.scaling` (set `queueUrl` for SQS-depth scaling), reapply
- Add a new agent persona → add an entry under `agentfleet.yaml` `spec.agents[]` referencing a route `name`
- Tighten the rate limit → edit `modelgateway.yaml` `spec.routes[].rateLimit` (requests/min)

## Bedrock access (IRSA)

Bedrock access is granted by the **Platform** CR, not this fleet. Ensure the
companion `platform.yaml`'s `spec.identity.allowedModelFamilies` includes the
family this fleet uses (`__MODEL_FAMILY__`). The operator expands that into the
per-Platform IRSA role at reconcile time — no per-fleet IAM is configured here.

## Bedrock Guardrails

Until a guardrail is provisioned in landing-zone, leave the `guardrailRef` (and
`spec.defaultGuardrailRef`) blocks commented out in `modelgateway.yaml`. Once
provisioned, uncomment and set the `name` to the guardrail resource's name.

## DRA accelerator

If `Compute` is `nvidia-*` or `neuron`, uncomment the `spec.compute.acceleratorClaim`
block in `agentfleet.yaml` and set its `name` to an `AcceleratorClaim` CR. The operator
turns that into a `ResourceClaimTemplate` referenced by the pod. Confirm the matching
`AcceleratorClaim` exists (provisioned by `landing-zone/components/aws/accelerator-pools`);
if absent, the AgentFleet stays `Pending` indefinitely.
