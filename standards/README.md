# nanohype standards

The production bar every build on the nanohype stack meets. This directory contains the **machine-readable** form (one JSON file per standard, all validated against `schemas/standards.schema.json`). This README is the **human-readable** form — same content, normative tone.

Use these standards as:

- The guardrails an external AI client (Bedrock agent, custom orchestrator, Claude API session) must obey when producing software on this stack.
- The contract the [reference client `fab`](https://github.com/nanohype/fab) implements (and that other clients can implement against).
- The validation surface for the SDK's `loadStandards()` helper and the `@nanohype/mcp` server's `list_standards` / `get_standard` tools.

What is **not** here: the merge-gate choreography, the role weights and per-dimension assignments, the agent roster, the factory preamble prompt, and the orchestration code that produces consistent output against this bar. Those live in the reference client.

---

## Language toolchain — `language-toolchain.json`

Per-language commands for the four executable phases (build, lint, test, docs) plus install, typecheck, manifest, lockfile, registry, and version-lookup metadata. Use this to dispatch language-agnostic build commands instead of hard-coding `npm run X` or `pytest` into a workflow that has to support more than one language.

Supported languages: `typescript`, `go`, `python`, `rust`, `java`, `kotlin`, `csharp`.

Every project on the stack exposes these four phases as distinct executable commands that exit zero from a clean checkout after running `install` first. CI runs each as its own job (not a fused script that short-circuits on first failure).

---

## Version currency — `version-currency.json`

Every new build adopts the **current stable** release of every language runtime, framework, and top-level dependency. Inherited defaults and template-shipped versions are not acceptable.

- Manifest entries more than one major behind current stable require an inline `@pin <reason>` annotation. Accepted reasons: `security hold`, `upstream bug`, `compatibility with pinned peer`. No annotation, no exception.
- Language runtimes at end-of-life are rejected regardless of `@pin` annotations. EOL is EOL.
- Currency is checked against each language's canonical registry (npm, proxy.golang.org, PyPI, crates.io, Maven Central, NuGet).

The anti-pattern this prevents: shipping `eslint 8.57` (EOL) + `vitest 1.x` (3 majors behind) + `typescript 5.4` on a greenfield project because the training-data default is stale.

---

## Platform tenant contract — `platform-tenant-contract.json`

Every k8s-native deliverable ships as a **Platform tenant** — a self-contained unit the [`eks-agent-platform`](https://github.com/nanohype/eks-agent-platform) operator can scaffold, suspend (via kill-switch), and tear down via CR reconciliation.

A tenant ships three artifacts:

1. A Helm chart in `<app>/chart/` with per-env values files
2. An ApplicationSet entry referenced by `nanohype/eks-gitops`
3. A Platform CR (and any required BudgetPolicy CR) declaring the tenant boundary

The operator reconciles Namespace, ResourceQuota, LimitRange, default-deny NetworkPolicy, ArgoCD AppProject, and the per-Platform IRSA role. The chart's own ServiceAccount carries the `eks.amazonaws.com/role-arn` annotation rendered from a per-env Helm value pointing at the landing-zone-owned IRSA role.

What you must **not** do inside a chart:

- Scaffold IAM roles (the operator + landing-zone own IRSA)
- Add cloud-substrate tofu (substrate lives in `nanohype/landing-zone`)
- Add cluster-level addons (addons live in `nanohype/eks-gitops`)
- Skip per-env values files (every chart has three, even if some are empty)
- Hardcode AWS account IDs, region names, or KMS ARNs

OTel resource attributes every pod must emit: `agents.tenant`, `agents.platform`, plus `agents.model_family` + `agents.model_id` for AI workloads.

---

## LLM policy — `llm-policy.json`

Claude via **AWS Bedrock** is the primary LLM. Authentication is IAM-role-based (IRSA on EKS, task role on ECS, execution role on Lambda) — never API keys.

Models:

- **Default**: `anthropic.claude-sonnet-4-6` — most work
- **Escalation**: `anthropic.claude-opus-4-6` — complex reasoning, architecture decisions
- **Light**: `anthropic.claude-haiku-4-5` — classification, routing, filter steps

Regions in order of preference: `us-west-2`, `us-east-1`, `eu-central-1`. Verify the chosen model is available in the deploy region before committing IaC.

Prompt caching is mandatory — use Bedrock `cachePoint` markers on the system prompt and any stable context prefix; measure cache-hit ratio and surface it in the architecture artifact.

Direct Anthropic SDK is permitted only when the intake brief explicitly requires it or Bedrock lacks the model variant. OpenAI and other providers require explicit brief-level requirement — never default to GPT.

---

## Quality rubric — `quality-rubric-dimensions.json`

Ten dimensions every build is graded against. This file names them and summarizes each. The internal review process (which reviewer grades which dimension, what weights apply, the A–F rubric thresholds, and the merge-gate enforcement choreography) is intentionally **not** public.

1. **Architecture & Domain Modeling** — bounded contexts, layering, model-to-code mapping
2. **Design Patterns & Reuse** — abstraction levels, pattern justification, reuse over reinvention
3. **Systems Thinking** — failure modes, blast radius, backpressure, second-order behavior
4. **Testing Strategy** — static base, integration middle, minimal e2e; orchestrator coverage
5. **Frontend Architecture & Design Systems** — components, accessibility, tokens (N/A for headless services)
6. **Security** — threat model, IAM least-privilege, supply chain, real identity resolution
7. **Code Quality & Craft** — naming, complexity, boundary error handling, explicit timeouts
8. **Documentation & Developer Experience** — README, runbook, CLAUDE.md, regenerated API docs
9. **Consistency & Polish** — convention inheritance, code shape, no aspirational comments

---

## Testing rubric — `testing-rubric.json`

The org's test baseline: the testing shape, the coverage floor, and the practices a build is held to. Read it when wiring up a project's test runner or grading the testing dimension.

- **Shape** — Testing Trophy: a wide static-analysis base (types + lint), an integration-heavy middle that carries the bulk of confidence, and a thin e2e cap. Integration over isolated unit tests for orchestration code.
- **Coverage floor** — branches ≥ 60; lines, functions, statements ≥ 75.
- **Rules** — encode the floor in the runner config (not just a CI flag); 100% on security-critical files; typecheck includes test files; hermetic integration (no live network in the default run); contract tests for every external API; per-package floors allowed but never below the global floor.

The deeper per-language enforcement (how each runner is configured, the REJECT criteria) lives in the reference client's bundled `quality-check` skill.

---

## Resource tagging — `resource-tagging.json`

The canonical tag/label taxonomy every cloud resource and k8s object on the stack carries. One vendor-neutral dimension set, rendered idiomatically per surface. Read it when injecting tags in `landing-zone`, stamping labels in the operator or a tenant chart, or auditing tags with `cloudgov`.

The taxonomy is three tiers:

- **Required (10)** — the billing + ownership + security skeleton, auto-injected on every resource: `environment`, `managed-by`, `project`, `repository`, `cost-center`, `business-unit`, `data-classification`, `compliance`, `component`, `team`.
- **Recommended (5)** — the _own / trace / expire_ idiom: `owner` (escalation handle), `revision` (deployed source rev), `provisioner` (the factory job that created it), `lifecycle` (`ephemeral` | `persistent`), `expiry` (the date an ephemeral resource is reapable). All auto-derivable; `lifecycle`+`expiry` make orphan-reaping policy-driven, `provisioner`+`revision` carry provenance.
- **Contextual (4)** — applied only where meaningful: `tenant`, `platform` (per-tenant / per-app identity), `model-family`, `model-id` (AI-workload OTel only).

Each dimension renders per surface by deterministic transform:

- **AWS tag key** — PascalCase (`cost-center` → `CostCenter`).
- **k8s label** — well-known dimensions under `app.kubernetes.io/*`, agent/tenant identity under `agents.nanohype.dev/*`, and org governance metadata under `platform.nanohype.dev/*`. These three prefixes are reserved.
- **OTel attribute** — the narrow operational-identity subset only: `deployment.environment`, `service.version`, and the reserved `agents.*` namespace (`agents.tenant`, `agents.platform`, `agents.model_family`, `agents.model_id`). Billing metadata stays out of OTel.

Apps extend with their own tags under a per-app namespace that avoids the reserved prefixes — `<app>.tenants.nanohype.dev/*` (k8s), `app:<key>` (AWS), their own OTel namespace. Audits only gate the required tier, so extensions never trip the gate.

The `required_by_surface` block is the flat, directly-consumable list of required keys per surface — `cloudgov tags --standard-file` reads `required_by_surface.aws` to gate CI without re-deriving the rendering.

---

## Resource naming — `resource-naming.json`

The grammar for _how a resource is named_, the companion to resource tagging's _what metadata it carries_. Read it when constructing a resource name in `landing-zone` / `eks-agent-platform` / `eks-fleet`, validating a cluster-vend request in `portal`, or gating names in `cloudgov`.

The core is a **domain split** — a resource's name shape follows where the resource lives, because that determines what the name has to disambiguate:

- **Cloud substrate** (S3, IAM, KMS, DynamoDB, SNS/SQS, SSM — one account per environment) is **env-first**, dash-delimited: `<environment>-<component>[-<tenant>][-<purpose>]`. The environment leads because these names sit side by side in IAM policies and SSM trees.
- **Cluster-scoped substrate** (the EKS cluster, its addon IRSA, monitoring, agent-iam, every eks-agent-platform component) keys on the **full cluster name** `<environment>-<clusterName>`, never the literal `eks` — so co-located sibling clusters don't collide.
- **k8s / ArgoCD-facing** names (Applications, Helm releases, namespaces) carry **no environment token** — the destination cluster already _is_ the environment.
- **Cross-environment views** (fleet-hub ApplicationSets, the portal cluster list) keep the token: `<environment>-<name>` — the one place it disambiguates rather than repeats.

**Cluster identity** is the tuple `(account, region, environment, name)`. The AWS EKS cluster name is `<environment>-<clusterName>`, where `clusterName` is required, RFC-1123, unique per `(account, region, environment)`, and must not equal the environment token. There is no generic `eks` default — a shared default collides the moment a second cluster is vended into one account and environment. Co-located clusters share the per-environment substrate (network/VPC, secrets, backup, dns); only cluster-scoped substrate re-keys per cluster.

Names are guarded, not hoped: the `no-doubled-env` rule (`<env>-<env>-*` rejected at the variable boundary), `bucket-global-uniqueness` (every S3 name embeds the account id), and `length-validated` (unbounded `tenant_id` / `clusterName` length-checked so an S3 63 / IAM 64 name can't overflow at apply). `cloudgov` reads the `reject`-tier rules to gate CI, the same way it reads `resource-tagging.json`.

---

## Observability and SLO — `observability-slo.json`

The bar for how every system is observed and what dashboard it ships to represent itself. Read it when wiring a service's metrics, authoring a Grafana dashboard, or grading the systems-thinking surface.

- **RED + USE + golden signals** — request-serving services expose Rate / Errors / Duration (latency as p50/p95/p99 from a histogram, never an average); saturable resources expose Utilization / Saturation / Errors. Panels and alerts query the **system's own nouns** (reconcile loop, vend pipeline, queue, model gateway, tofu run) — generic node/CPU dashboards and embedded community boards do not count as representing the system.
- **At least one SLO per system** — an SLI (good/valid ratio) over a 30-day window against an objective. Default availability objective `0.999`; add a latency SLO for latency-sensitive paths. The remaining error budget is `(1 - objective)` minus what's been spent.
- **Multi-window multi-burn-rate alerts** — alert on the _rate_ the budget burns, not instantaneous error ratio. The canonical four windows: page at 14.4× (1h/5m) and 6× (6h/30m), ticket at 3× (1d/2h) and 1× (3d/6h). An alert fires only when both its long and short window exceed the burn-rate factor.
- **Recording-rule convention** — `<metric>:sli_error:ratio_rate<window>` over each window; burn-rate alerts reference these rather than recomputing inline.
- **The required dashboard** — five rows: an SLO/error-budget row (30d SLI vs objective, budget remaining, fast/slow burn) plus traffic, errors, latency (p50/p95/p99), and saturation.
- **Fleet alerting** — how CloudWatch alarms across the fleet are severity-tiered (critical→page, warning→ticket, info→record), tagged with a standard dimension set (`Environment`, `ClusterName`, `Severity`), and rolled up per cluster: one composite alarm per severity ORs its child alarms, carries the SNS action, and leaves the children actionless — so a hard-down cluster pages **once**, not once per firing alarm. Definitions stay with the resources they watch; only the SNS destination centralizes (`shared-observability` owns the topics). The `observability` landing-zone component renders alarms and composites from this shape.

`tenant-chart-base` renders this standard's shape: a `GrafanaDashboard` CR (reconciled by the grafana-operator onto the external Amazon Managed Grafana, self-contained so it renders against AMP with no ruler), the PrometheusRule (SLI recording rules + the four burn-rate alerts), and the optional ServiceMonitor. Every k8s tenant inherits it with observability **on by default**. The baseline pushes metrics via OTLP to the cluster collector — the standard's accepted "equivalent scrape config" — so the ServiceMonitor is opt-in. Note the delivery split: the dashboard reaches Grafana via the operator on every cluster, while the PrometheusRule is consumed where kube-prometheus-stack runs (the local kx cluster). On AMP-only clusters there is no in-cluster ruler, so burn-rate **alerts** require a rules sink — AMP rule groups or Grafana-managed alerting — while the **dashboards** render unchanged.

---

## Telemetry pipeline — `telemetry-pipeline.json`

How telemetry **moves**, as three contracts. Companion to `observability-slo.json`, which owns _what_ to measure and when to alert; this owns how the measurements travel and who may read them. Read it when wiring a workload's export, adding a collector, or changing where a cluster's signals land.

- **The collection contract** — every workload emits OTLP (4317 gRPC / 4318 HTTP) to one stable alias Service, `telemetry.<monitoring-ns>.svc.cluster.local`, deliberately **not** named for the collector behind it. Naming the endpoint after the implementation makes every consumer a hostage of it: swapping collectors becomes a coordinated edit across every tenant chart. Two collector tiers — a DaemonSet **agent** that only collects, a Deployment **gateway** that owns all ingest and every export — because collection and delivery are separate concerns, and an agent that also exported would put the backend's credentials and failure modes on every node. Workloads emit to the gateway through the alias, not to the agent: terminating ingest in one place keeps the endpoint a single name with a single set of receivers, and keeps a hostPort off every node. A node agent scrapes only its own node; a cluster-wide scrape target on a DaemonSet produces one copy of every series per node, an N-fold duplication that reads as inflated rates rather than as a bug.
- **The tier contract** — a cluster declares `floor` or `full` as an **always-set** label (a generator selects on a value; it cannot branch on a key's absence). `floor` is provider-native only: Container Insights metrics, EMF for application metrics, the provider's log service, the provider's trace store — a difference in destination, not in coverage. `full` adds a Prometheus-compatible store, a log-query store and a trace store, and requires a managed-monitoring substrate the cluster must actually have. The invariant that matters: **both tiers run the same agent, the same gateway and the same endpoint** — only the exporters differ, so a workload chart is byte-identical across tiers. If a tier change reaches an application, the tiering is wrong. Default is `floor`; a cluster already running the higher tier pins it explicitly rather than inheriting it.
- **The signal contract** — when telemetry makes the platform _act_, it publishes a structured event to the cluster's governance bus, so the action is auditable and routable rather than buried in a controller log. `BurnRateBreach` (source `governance.nanohype.dev/slo`) and `BudgetBreach` (source `governance.nanohype.dev/budget`), each carrying enough detail to render an audit line without re-reading cluster state. Sources and detail-types on a shared bus must be **disjoint, asserted by a test** — two governance loops sharing a bus is fine; one matching the other's events is a tenant suspended for a latency regression. And publishing is not the same as taking effect: a loop that acts on telemetry verifies the effect it intended and reports when it did not land.
- **Discovery** — one prefix, `/eks-agent-platform/<cluster-name>/<component>/<key>`, keyed by the **consumer** rather than the producer so the contract holds regardless of which component wrote the value: the query endpoint, the severity notification topics, the governance bus and its response machine. A path that does not exist means the cluster does not run that substrate — a floor cluster publishes no query endpoint — and a consumer degrades and says so rather than failing to start.

Two rules carry more weight than the rest, because both failure modes are silent. **Absent is not healthy**: a missing signal and a zero reading are different facts and must stay distinguishable end to end, or an outage renders as a green dashboard. And **never release an automated hold because the signal that justified it became unavailable** — losing telemetry during an incident is exactly when reverting the action is worst.

---

## SEO baseline — `seo-baseline.json`

Every public site the factory ships presents **one canonical origin** and a fixed set of discovery artifacts. Read it when building or reviewing a site's SEO surface.

- **Apex is canonical** — the bare apex serves (`https://example.com/`). If `www` exists it **301-redirects to the apex**, enforced at the edge. Never redirect the apex to `www` (inverted canonical) and never serve both apex and `www` with `200` (duplicate content). HTTP 301s to HTTPS; no plaintext origin. The `rel=canonical` tag equals the served apex origin exactly (protocol + host).
- **Four required files** — `/robots.txt` (allow all, agents welcome, points at the sitemap), `/sitemap.xml` (build-generated from the route table, never hand-maintained), `/llms.txt` (machine-readable site summary for agents, linked from the head), and `/og.png` (1200×630 Open Graph share image).
- **Required head tags** — `<title>` (unique per page), meta description, `rel=canonical`, the Open Graph set (`og:type`/`og:url`/`og:title`/`og:description`/`og:image`/`og:site_name`), the Twitter card set, and meta `robots`. The `google-site-verification` meta tag and schema.org JSON-LD are optional.
- **One GSC property per site** — a single Google Search Console **URL-prefix** property at the apex, verified by the `google-site-verification` **meta tag** (not a per-repo HTML file), all sites under one Google account. No Domain-plus-prefix duplication and no separate `www` property.
- **Shared implementation** — head tags come from a shared SEO component and the files from shared build-time sitemap/robots generators, consumed as a package rather than per-repo hand-rolled copies that drift (for static sites the head component renders at build time so the tags are present in the served HTML).

---

## Versioning

Each file declares its `version` (a positive integer). Bump the version field on any breaking shape change. Agents that consume these standards should pin to a major version range (the `version` field == major; minor evolution within a major must be backwards-compatible).

CI validates every file in this directory against `schemas/standards.schema.json` on every pull request.

---

## See also

- [Platform Reference](../docs/platform-reference.md) — the single entry point for clients building on the stack
- [Template contract](../docs/spec/template-contract.md) — what's in `templates/`
- [Composite contract](../docs/spec/composite-contract.md) — what's in `composites/`
- [Consumer guide](../docs/spec/consumer-guide.md) — how to consume templates programmatically
