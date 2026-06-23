# tenant-chart-base

A Helm **library chart** (`type: library`) holding the named templates every nanohype Platform-tenant chart shares. It's the catalog's first library chart.

## What you get

A `chart/` directory containing a library chart with these named templates (all in `templates/_*.tpl`):

- `tenant-chart-base.serviceaccount` — ServiceAccount with the tenant's IRSA role annotation (`aws.platformRoleArn`). No inline IAM — it only references the role landing-zone provisions.
- `tenant-chart-base.networkpolicy` — the NetworkPolicy CR scaffold with values-driven `ingress` (varies by workload topology) and `egress` (the DNS + HTTPS-out baseline).
- `tenant-chart-base.prometheusrule` — the PrometheusRule CR scaffold. Per the `observability-slo` standard it renders SLI recording rules over the burn-rate windows plus multi-window multi-burn-rate error-budget alerts (2 page, 2 ticket) from the `slo.*` values. `prometheusRule.groups` overrides it verbatim for latency or custom-shaped SLOs; with `slo.enabled` false it falls back to one example RED alert.
- `tenant-chart-base.serviceMonitor` — an optional ServiceMonitor for apps that expose a Prometheus `/metrics` endpoint. Off by default (the baseline pushes metrics via OTLP to the cluster collector — the standard's equivalent scrape config).
- `tenant-chart-base.grafanaDashboard` — the dashboard ConfigMap; loads `chart/dashboards/<name>.json` verbatim.
- helpers — `tenant-chart-base.name` / `.fullname` / `.labels` / `.selectorLabels` / `.serviceAccountName`. The tenant/platform labels come from `otel.resourceAttributes`.

The named templates run in the **consumer's** context, so `.Chart`, `.Values`, and `.Release` resolve to the consuming app — `tenant-chart-base.name` returns the app's name, not `tenant-chart-base`.

Two things are **not** in the base, by design:

- **Workload topology** (Deployments, CronJobs, Services, Ingress) — the one legitimate per-app divergence (single-pod vs api+web vs webhook+processor).
- **ExternalSecret** — secret keys are per-tenant, and some apps compose values via `target.template`. It stays in the consumer.

## How to consume it

The SDK renders files; it doesn't run `helm`. So a consumer **vendors** this library rather than fetching it.

First, copy `chart/` into the consumer at `chart/charts/tenant-chart-base/` (the `sync-library` script does this automatically — see below).

Then declare it as a local dependency in the consumer's `Chart.yaml`:

```yaml
dependencies:
  - name: tenant-chart-base
    version: 0.2.0
    repository: file://charts/tenant-chart-base
```

Finally, replace each lifted template with a one-line wrapper, e.g. `chart/templates/serviceaccount.yaml`:

```yaml
{{ include "tenant-chart-base.serviceaccount" . }}
```

Because the library is vendored (present in `charts/`), `helm template` / `helm lint` work offline — no `helm dependency build` needed.

### Keeping the vendored copy in sync

The library template here is the single source of truth. Consumer copies are kept honest by:

```sh
npm run sync:library      # vendor this chart into every consumer that declares the file:// dependency
npm run verify:library    # CI gate: re-vendor + fail on drift
```

`k8s-app-tenant` is the reference consumer.

## Variables

None — a library chart is consumed as-is; the named templates read the consumer's values at include time.

## Project layout

```text
chart/
  Chart.yaml                       # type: library
  templates/
    _helpers.tpl                   # name / fullname / labels / selectorLabels / serviceAccountName
    _serviceaccount.tpl
    _networkpolicy.tpl
    _prometheusrule.tpl            # SLO recording rules + multi-burn-rate error-budget alerts
    _servicemonitor.tpl            # optional scrape config (off by default)
    _grafana-dashboard.tpl
```

## Pairs with

- `k8s-app-tenant` — the primary consumer; its chart vendors this library and thin-includes the named templates.

## Nests inside

- `monorepo`
