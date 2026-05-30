# K8s-native template additions

Tactical plan for Phase 2.3 + 2.4 of master plan (`/Users/bs/.claude/plans/so-i-want-to-snazzy-sun.md`).

Status: NOT STARTED.

## New templates to create

### `templates/k8s-app-tenant/`

Primary scaffold for any new k8s-native app. Produces:

- `chart/Chart.yaml`, `chart/values.yaml`, `chart/values-{dev,staging,production}.yaml`
- `chart/templates/{deployment,service,serviceaccount,networkpolicy}.yaml`
- `gitops/applicationset-entry.yaml` (matches eks-gitops ApplicationSet template style)
- `platform.yaml` — `Platform` CR

Variables (PascalCase):

- `AppName` — kebab-case app name
- `Namespace` — defaults to `AppName`
- `Image` — container image base
- `Port`
- `IrsaPolicies` — list of AWS managed/inline policies the Platform reconciler should attach
- `ExposeIngress` — bool
- `HasCronJobs` — bool conditional

Reference: existing `templates/k8s-deploy/` skeleton; eks-gitops `addons/<category>/<name>/` Helm values pattern; eks-agent-platform `Platform` CR shape in `ARCHITECTURE.md`.

### `templates/agent-fleet/`

Scaffold for AI workloads — adds AgentFleet CR + ModelConfig + KEDA scaler on top of (or alongside) `k8s-app-tenant`.

Variables:

- `FleetName`
- `Models` — list of {family, modelId, route}
- `ScaleTrigger` — `sqs` | `cpu` | `cron`
- `Compute` — accelerator class (`none` | `nvidia-l40s` | `nvidia-h100` | `neuron`)

Reference: `eks-agent-platform/ARCHITECTURE.md` AgentFleet CRD field shape; `agents.nanohype.dev/v1alpha1` API group.

### `templates/landing-zone-component/`

Scaffold a new OpenTofu component for `nanohype/landing-zone`.

Variables:

- `ComponentName` — snake_case
- `Cloud` — `aws` | `gcp` | `azure`
- `Multitenant` — bool (adds `var.tenants = map(object({...}))` + `for_each` skeleton)
- `Dependencies` — list of component names to wire via `live/_envcommon/`

Produces:

- `components/{cloud}/{ComponentName}/{main,variables,outputs,versions}.tf`
- `modules/tenant/` skeleton if `Multitenant`
- `live/_envcommon/{cloud}/{ComponentName}.hcl`

Reference: landing-zone `CLAUDE.md` "File Structure" section; existing components in `components/aws/`.

### `templates/eks-addon/`

Scaffold a new addon for `nanohype/eks-gitops`.

Variables:

- `AddonName`
- `Category` — `bootstrap` | `networking` | `security` | `observability` | `operations` | `argo-platform`
- `AddonType` — `helm` | `kustomize`
- `SyncWave` — int

Produces:

- For Helm: `addons/{Category}/{AddonName}/values.yaml` + `values-{dev,staging,production}.yaml`
- For Kustomize: `addons/{Category}/{AddonName}/base/` + `overlays/{dev,staging,production}/`

Reference: eks-gitops `CLAUDE.md` Helm Values Pattern + Kustomize Addons sections.

## Template rewrites

### `templates/infra-aws/`

Reframe README as "Lambda / edge / serverless escape hatch — primary path is `k8s-app-tenant`". Skeleton unchanged (still scaffolds an AWS CDK project) but framed as opt-in for cases where running a pod isn't the right shape.

### `templates/k8s-deploy/`

Decide during execution: rewrite to align with eks-gitops conventions, OR delete in favor of `k8s-app-tenant`. Lean toward delete + redirect — having two "deploy to k8s" templates dilutes the canonical path.

## Catalog updates

- `CLAUDE.md` — list new templates under the appropriate categories (infrastructure / ai-systems)
- `docs/spec/template-contract.md` — verify the contract supports any new field shapes used by the new templates
- `schemas/template.schema.json` — same

## Verification

```sh
cd /Users/bs/codes/nanohype/nanohype
npm run validate:catalog                                               # all templates including new ones validate
./scripts/validate.sh templates/k8s-app-tenant                         # full per-template validation
./scripts/validate.sh templates/agent-fleet
./scripts/validate.sh templates/landing-zone-component
./scripts/validate.sh templates/eks-addon

# SDK dry-render against sample variables
cd sdk && npm test
```

## Order of operations

1. `k8s-app-tenant` (foundation — other migrations need this first)
2. `landing-zone-component` (referenced by per-tenant scaffolds)
3. `eks-addon` (referenced when migration surfaces new addon needs)
4. `agent-fleet` (composes with `k8s-app-tenant` for AI workloads)
5. `infra-aws` README rewrite
6. `k8s-deploy` decision + execution
