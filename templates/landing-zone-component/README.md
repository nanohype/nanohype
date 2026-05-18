# landing-zone-component

Scaffolds a new OpenTofu component into [`nanohype/landing-zone`](https://github.com/nanohype/landing-zone). Produces the `components/<cloud>/<name>/` root module plus the `live/_envcommon/<cloud>/<name>.hcl` dependency-wiring file. Optionally adds a `modules/tenant/` submodule for multi-tenant components.

AWS variant only for now; GCP and Azure follow the same shape and can be added by copying + tweaking provider blocks.

## What you get

- `components/aws/__COMPONENT_NAME__/main.tf` — root-module resource definitions, with default tags merged from the env-config map
- `components/aws/__COMPONENT_NAME__/variables.tf` — typed variables with descriptions (required by landing-zone's `tflint terraform_documented_variables`)
- `components/aws/__COMPONENT_NAME__/outputs.tf` — outputs with descriptions
- `components/aws/__COMPONENT_NAME__/versions.tf` — provider + tofu version constraints (matches landing-zone's `>= 1.11.0` floor)
- `live/_envcommon/aws/__COMPONENT_NAME__.hcl` — env-shared inputs and `dependency` blocks
- `modules/tenant/main.tf` + `variables.tf` (only when `Multitenant=true`) — per-tenant submodule with `var.tenants = map(object({...}))` shape consistent with druid / pipeline / gateway / llm / mlops / rag / governance

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ComponentName` | string | (required) | Snake_case component name (directory + resource prefix) |
| `Description` | string | (required) | One-sentence component description |
| `Multitenant` | bool | `false` | Add `modules/tenant/` + `for_each` skeleton |

## Project layout

```text
landing-zone/
  components/
    aws/
      __COMPONENT_NAME__/
        main.tf
        variables.tf
        outputs.tf
        versions.tf
        modules/tenant/                   # only if Multitenant
          main.tf
          variables.tf
  live/
    _envcommon/
      aws/
        __COMPONENT_NAME__.hcl
```

## Pairs with

- `eks-addon` — when a component provisions an in-cluster resource the addon needs to reference (e.g., a KMS key the cluster's External Secrets must decrypt)

## Nests inside

- `monorepo` (the landing-zone repo itself is the monorepo target — drop these files at the matching paths)

## Conventions

Inherited from landing-zone's CLAUDE.md:

- OpenTofu >= 1.11.0 — never `terraform`
- Snake_case for all resource names and variables (enforced by `tflint terraform_naming_convention`)
- Variables and outputs must have descriptions (`tflint terraform_documented_variables` + `terraform_documented_outputs`)
- Default tags (Environment, ManagedBy, Project) are injected by root `terragrunt.hcl` — do not duplicate
- Dependency wiring lives in `live/_envcommon/aws/<name>.hcl`, not the component itself

## After scaffolding

1. Render placeholders to the actual landing-zone checkout
2. Add resources to `main.tf` per the component's purpose
3. Validate: `cd components/aws/__COMPONENT_NAME__ && tofu init -backend=false && tofu validate`
4. Lint: `task lint CLOUD=aws`
5. Plan: `make plan CLOUD=aws ACCOUNT=workload-dev REGION=us-west-2 ENVIRONMENT=dev COMPONENT=__COMPONENT_NAME__`
6. Open a PR; the landing-zone CI matrix runs `validate`, `lint`, `checkov`, and `plan` automatically
