# k8s/infra templates — quality + CRD-group correctness

Master plan: `~/.claude/plans/wiggly-yawning-gem.md` (Phase 1 + 2). All repos local.

Status: **Phase 1 + 2 COMPLETE** — all 7 k8s/infra templates pass `validate.sh`,
schemas + standards validate, k8s-app-tenant chart `helm lint`s clean (toggles on + off),
catalog regenerated. Group rename verified zero remaining `agents.stxkxs.io` in
templates/standards/catalog/docs.

## Kind-aware group mapping (operator ground truth)
- Tenant, Platform → `platform.nanohype.dev/v1alpha1`
- AgentFleet, ModelGateway, AgentSandbox, SandboxPool, BatchJob → `agents.nanohype.dev/v1alpha1`
- BudgetPolicy, EvalSuite → `governance.nanohype.dev/v1alpha1`

Canonical specs verified against `eks-agent-platform/operators/api/{platform,agents,governance}/v1alpha1/*_types.go`:
- PlatformSpec: `{displayName?, persona(enum), tenant, budget.name, identity.{allowedModelFamilies|allowedModels, extraPolicyArns}, compliance.{soc2,hipaa}?, isolation? (namespace|vcluster)}`
- BudgetPolicySpec: `{platformRef.name, monthlyUsd, alertThresholdsPercent[], killSwitchEnabled}`
- AgentFleetSpec: `{platformRef.name, agents[]{name,systemPrompt,modelRoute,tools[]?,replicas?}, scaling{enabled,min?,max?,queueDepthTrigger?,queueUrl?(SQS-URL regex)}, compute?{acceleratorClaim.name,resources?}}`
- ModelGatewaySpec: `{platformRef.name, routes[]{name,modelFamily(enum anthropic|meta|mistral|cohere|amazon-titan|amazon-nova|stability),modelId,crossRegionProfile?,rateLimit?(int rpm),guardrailRef.name?}, defaultGuardrailRef.name?}`

## Phase 1
- [x] **agent-fleet** (non-functional today)
  - [x] skeleton/modelgateway.yaml → valid ModelGatewaySpec, group `agents.nanohype.dev/v1alpha1`
  - [x] skeleton/agentfleet.yaml → valid AgentFleetSpec, group `agents.nanohype.dev/v1alpha1`
  - [x] template.yaml: fix description group; drop `ScaleTrigger`; tighten `ModelFamily` (enum); reword `RouteName`
  - [x] README.md + skeleton/README.md: CR field names, IRSA via Platform.spec.identity, wait-phase Ready (not Programmed), OTel attrs operator-injected
- [x] **k8s-app-tenant** (primary path)
  - [x] _helpers.tpl: `index .Values.otel.resourceAttributes "agents.tenant"` (render bug)
  - [x] platform.yaml: valid Platform + required BudgetPolicy (governance group)
  - [x] template.yaml: add `Persona`, `MonthlyUsd` vars; fix group string + narrative
  - [x] deployment.yaml: OTLP :4317→:4318 + protocol; terminationGracePeriod + preStop
  - [x] serviceaccount.yaml + values.yaml: render role-arn from `aws.platformRoleArn`
  - [x] back-port externalsecret.yaml / prometheusrule.yaml / grafana-dashboard.yaml (+ dashboards/__APP_NAME__.json), toggleable, optional default false
  - [x] README.md: fix group + reconcile narrative
- [x] **k8s-deploy**: replace `:latest` with pinned `__IMAGE_TAG__` from CI SHA; `kubectl set image` over brittle sed
- [x] **monitoring-stack**: bump Grafana/Prometheus/Loki tags to current stable (verify), keep pinned
- [x] **infra-druid**: optional networkpolicy.yaml; verify DruidVersion currency
- [x] **eks-addon / istio-policy**: minor doc notes only
- [x] **label-key decision**: grep selectors for `agents.stxkxs.io/{tenant,platform}` labels before any rename; if renamed, do template + 4 tenant charts in lockstep

## Phase 2
- [x] standards/platform-tenant-contract.json: platform_cr_shape.apiVersion → platform.nanohype.dev/v1alpha1
- [x] catalog.json: agent-fleet + k8s-app-tenant descriptions (drop agents.stxkxs.io)

## Verify
- [x] `./scripts/validate.sh templates/<name>` per template; `npm run validate:catalog`
- [x] render k8s-app-tenant chart; `helm lint` + `helm template` with optional toggles on/off
- [x] CR shapes verified field-by-field against operator Go types (no live cluster for server dry-run — fix-it-forward)
