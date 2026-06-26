# __ADDON_NAME__ addon

Helm-based addon for `nanohype/eks-gitops`. Uses chart `__CHART_NAME__` from `__CHART_REPO__` pinned to `__CHART_VERSION__`.

## Files added to the gitops repo

```
addons/__CATEGORY__/__ADDON_NAME__/
  values.yaml                  # base values
  values-dev.yaml              # dev delta only
  values-staging.yaml          # staging delta only
  values-production.yaml       # prod delta only
```

## After landing in the gitops repo

1. Fill in `values.yaml` with chart-appropriate base values (look at the upstream chart's defaults as the starting point)
2. Trim per-env files to ONLY include keys that differ from base — never full copies
3. Add an ApplicationSet entry referencing this addon. Choose the right ApplicationSet based on category + addon type:
   - `applicationsets/addons-bootstrap.yaml` (Helm bootstrap addons)
   - `applicationsets/addons-bootstrap-kustomize.yaml` (Kustomize bootstrap)
   - `applicationsets/addons-networking.yaml`
   - `applicationsets/addons-security.yaml`
   - `applicationsets/addons-observability.yaml`
   - `applicationsets/addons-operations-helm.yaml`
   - `applicationsets/addons-operations-kustomize.yaml`
   - `applicationsets/addons-argo-platform.yaml`
4. The new entry follows this shape (Helm multi-source):
   ```yaml
   - name: __ADDON_NAME__
     path: addons/__CATEGORY__/__ADDON_NAME__
     chart: __CHART_NAME__
     repoURL: __CHART_REPO__
     targetRevision: __CHART_VERSION__
     syncWave: "__SYNC_WAVE__"
   ```
5. Validate: `task validate` (yamllint + kustomize build all environments)

## Updating the chart version

Edit the ApplicationSet entry's `targetRevision` (the version pin). Never floating versions — use `helm search repo __CHART_NAME__` to confirm the new pin before bumping.
