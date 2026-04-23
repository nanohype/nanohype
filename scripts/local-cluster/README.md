# Local cluster harness

Recipe-based local-cluster tooling for validating nanohype templates that have a cluster-side component. Each recipe defines a reproducible local environment; a `verify` command renders a template (or composite) into a temp dir and runs the right checks against it.

Lives alongside the other repo scripts because it's development tooling, not a template. If the shape stabilizes, it could graduate into its own template (`templates/infra-local-cluster/`) — punted for now.

## Quick start

```sh
# Prerequisites: Docker running, + kind / kubectl / istioctl on PATH.
# Optional but used when available: helm, yq, mvn.

make -C scripts/local-cluster up RECIPE=istio
make -C scripts/local-cluster verify COMPOSITE=identity-aware-service
make -C scripts/local-cluster down RECIPE=istio
```

## Recipes

| Recipe | Use it to validate | Extras on top of plain k8s |
|---|---|---|
| `istio` | `k8s-deploy`, `istio-policy`, service composites | Istio demo profile, `apps` namespace with sidecar injection |
| `monitoring` | `monitoring-stack` | Pre-created `monitoring` namespace; no operators yet (monitoring-stack ships its own CRDs) |

Add a new recipe by creating `recipes/<name>/` with `up.sh`, `down.sh`, `status.sh`, `README.md`, and (typically) `kind-config.yaml`. The Makefile discovers it automatically.

## The `verify` command

Thick driver — knows about catalog templates by name. For a given template or composite:

1. Looks up scaffold-variable defaults from `lib/defaults.sh` (conservative placeholders — change them when a real user would)
2. Renders via the `@nanohype/sdk` CLI to a temp directory
3. Consults `checks_for()` to decide which validators apply (`mvn`, `kubectl`, `istioctl`, `helm`) and runs each
4. Reports per-check PASS / SKIP / FAIL with a summary

```sh
make verify TEMPLATE=spring-boot-service                           # mvn verify
make verify TEMPLATE=istio-policy                                  # kubectl + istioctl
make verify COMPOSITE=identity-aware-service                       # mvn + kubectl + istioctl + helm
make verify COMPOSITE=spring-boot-microservice FORMAT=json         # same, machine-readable
```

Checks degrade gracefully: if `mvn` / `helm` / `istioctl` / `yq` isn't installed, that check is marked **SKIP** rather than failing. If the required recipe's cluster isn't up, cluster-side checks are **SKIP** with a reminder of what to run.

## Lower-level: `validate`

When you don't want the orchestration, `validate` just dry-run-applies a rendered tree:

```sh
make validate DIR=/tmp/ias-render RECIPE=istio
```

Useful when you've already got a render from a previous `nanohype scaffold` invocation.

## What's in each recipe

Every recipe is a directory under `recipes/` with four executables and a config:

| File | Purpose |
|---|---|
| `kind-config.yaml` | kind cluster configuration (node count, port mappings) |
| `up.sh` | Create the cluster and install any baseline components (Istio, operators, etc). Idempotent. |
| `down.sh` | Delete the cluster. Idempotent. |
| `status.sh` | Report what's running. Useful for debugging. |
| `README.md` | Documents the recipe's footprint, port mappings, and evolution plan. |

Recipes source `../../lib/common.sh` for color output helpers, tool-presence checks, and the `nanohype-<recipe>` cluster-naming convention.

## Layout

```text
scripts/local-cluster/
  Makefile                      # entry point — `make help`
  README.md                     # this file
  lib/
    common.sh                   # shared bash helpers (colors, tool checks, naming)
    validate.sh                 # low-level: dry-run apply a tree
    defaults.sh                 # per-template scaffold defaults + check declarations
    verify.sh                   # thick driver: render + run checks
  recipes/
    istio/
      kind-config.yaml
      up.sh   down.sh   status.sh   README.md
    monitoring/
      kind-config.yaml
      up.sh   down.sh   status.sh   README.md
```

## CI

The harness is designed to run unattended on CI:

- Every command is non-interactive (no prompts, no tty-only input)
- Exit codes are meaningful — 0 for success, 1 for validation failure, specific non-zero codes from the underlying tools on infrastructure errors
- Set `CI=1` or `NO_COLOR=1` to suppress ANSI color
- `verify FORMAT=json` emits a single JSON object for machine consumption
- Missing optional tools produce `SKIP` results rather than failing the whole run

A future GitHub Actions workflow can do roughly:

```yaml
- uses: helm/kind-action@v1
- run: |
    brew install istioctl helm yq  # or equivalents
    make -C scripts/local-cluster up RECIPE=istio
    make -C scripts/local-cluster verify-all FORMAT=json > results.json
```

Not wired into this repo's CI yet — tracked separately once the harness has seen enough use to confirm the shape.

## Adding a new recipe

1. Create `recipes/<new-recipe>/` with the four files above
2. Source `../../lib/common.sh` in the scripts
3. Update `lib/defaults.sh`:
   - `default_recipe_for()` — map any templates whose cluster validation uses this recipe
   - `checks_for()` — declare which checks apply (if different from existing ones)
4. Add a row to the recipe table in this README
