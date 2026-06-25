# render-assert

A composite GitHub Action that asserts **rendered** Kubernetes manifests carry no
unfilled sentinels. It's the render-time complement to a source-file
no-placeholders gate: a source scan catches sentinels you can see in the repo,
this catches the ones that only appear *after* templating — chart defaults,
vendored charts, or an ARN a template builds from a value it never received.

## What it flags

In any `*.yaml` / `*.yml` under the rendered directory:

- `000000000000` — the zero AWS account id
- `PLACEHOLDER`, `g-PLACEHOLDER`, `REPLACE_ME`/`REPLACEME`, `CHANGE_ME`/`CHANGEME` — unfilled placeholder tokens
- `arn:aws:iam:::…` — an IAM ARN whose account segment is empty

## What it deliberately does NOT flag

Empty `*RoleArn` / annotation fields (`roleArn: ""`). When a value is injected at
sync time — an ArgoCD cluster Secret, EKS Pod Identity — it is legitimately empty
at render time. An empty field is not a placeholder bug. An account-less ARN is,
and the empty-field case never produces one. The org example account ids
`111111111111` / `222222222222` are intentional and are not sentinels.

## Usage

Render first (each repo renders its own charts/overlays its own way), then call the
action against the output:

```yaml
- name: Render manifests
  run: |
    mkdir -p rendered
    # e.g. kustomize build --enable-helm path/overlays/production > rendered/prod.yaml
    # or   helm template <chart> -f values.yaml -f values-production.yaml > rendered/x.yaml

- name: Assert no unfilled sentinels in rendered output
  uses: nanohype/nanohype/.github/actions/render-assert@main
  with:
    manifests: rendered
    # optional: drop known-legitimate hits by an ERE over "file:line:match" lines
    exclude: 'mcp-tunnel'
```

## Inputs

| input | default | description |
|-------|---------|-------------|
| `manifests` | `rendered` | Directory of rendered manifests to scan. |
| `exclude` | `''` | Extended-regex matched against `file:line:match` result lines, to drop known-legitimate hits. |

An empty manifests directory fails the action (a render step that produced nothing
is a misconfiguration, not a pass).

## Local use

The logic lives in `assert.sh` and is self-tested by `test.sh`:

```sh
bash .github/actions/render-assert/assert.sh <rendered-dir> [exclude-regex]
bash .github/actions/render-assert/test.sh   # fixtures: clean pass, dirty caught
```
