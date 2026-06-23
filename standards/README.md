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
2. An ApplicationSet entry referenced by `nanohype/eks-gitops` or `nanohype/aks-gitops`
3. A Platform CR (and any required BudgetPolicy CR) declaring the tenant boundary

The operator reconciles Namespace, ResourceQuota, LimitRange, default-deny NetworkPolicy, ArgoCD AppProject, and the per-Platform IRSA role. The chart's own ServiceAccount carries the `eks.amazonaws.com/role-arn` annotation rendered from a per-env Helm value pointing at the landing-zone-owned IRSA role.

What you must **not** do inside a chart:

- Scaffold IAM roles (the operator + landing-zone own IRSA)
- Add cloud-substrate tofu (substrate lives in `nanohype/landing-zone`)
- Add cluster-level addons (addons live in `nanohype/eks-gitops` / `aks-gitops`)
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

Nine dimensions every build is graded against. This file names them and summarizes each. The internal review process (which reviewer grades which dimension, what weights apply, the A–F rubric thresholds, and the merge-gate enforcement choreography) is intentionally **not** public.

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
- **Recommended (5)** — the *own / trace / expire* idiom: `owner` (escalation handle), `revision` (deployed source rev), `provisioner` (the factory job that created it), `lifecycle` (`ephemeral` | `persistent`), `expiry` (the date an ephemeral resource is reapable). All auto-derivable; `lifecycle`+`expiry` make orphan-reaping policy-driven, `provisioner`+`revision` carry provenance.
- **Contextual (4)** — applied only where meaningful: `tenant`, `platform` (per-tenant / per-app identity), `model-family`, `model-id` (AI-workload OTel only).

Each dimension renders per surface by deterministic transform:

- **AWS / Azure tag key** — PascalCase (`cost-center` → `CostCenter`).
- **GCP label key** — snake_case (`cost-center` → `cost_center`); the value is lower-cased with `-`/`/` mapped to `_` and truncated to 63 (GCP labels accept only `[a-z0-9_-]`).
- **k8s label** — well-known dimensions under `app.kubernetes.io/*`, agent/tenant identity under `agents.nanohype.dev/*`, and org governance metadata under `platform.nanohype.dev/*`. These three prefixes are reserved.
- **OTel attribute** — the narrow operational-identity subset only: `deployment.environment`, `service.version`, and the reserved `agents.*` namespace (`agents.tenant`, `agents.platform`, `agents.model_family`, `agents.model_id`). Billing metadata stays out of OTel.

Apps extend with their own tags under a per-app namespace that avoids the reserved prefixes — `<app>.tenants.nanohype.dev/*` (k8s), `app:<key>` (AWS/Azure), `app_<key>` (GCP), their own OTel namespace. Audits only gate the required tier, so extensions never trip the gate.

The `required_by_surface` block is the flat, directly-consumable list of required keys per surface — `cloudgov tags --standard-file` reads `required_by_surface.aws` to gate CI without re-deriving the rendering.

---

## Observability and SLO — `observability-slo.json`

The bar for how every system is observed and what dashboard it ships to represent itself. Read it when wiring a service's metrics, authoring a Grafana dashboard, or grading the systems-thinking surface.

- **RED + USE + golden signals** — request-serving services expose Rate / Errors / Duration (latency as p50/p95/p99 from a histogram, never an average); saturable resources expose Utilization / Saturation / Errors. Panels and alerts query the **system's own nouns** (reconcile loop, vend pipeline, queue, model gateway, tofu run) — generic node/CPU dashboards and embedded community boards do not count as representing the system.
- **At least one SLO per system** — an SLI (good/valid ratio) over a 30-day window against an objective. Default availability objective `0.999`; add a latency SLO for latency-sensitive paths. The remaining error budget is `(1 - objective)` minus what's been spent.
- **Multi-window multi-burn-rate alerts** — alert on the *rate* the budget burns, not instantaneous error ratio. The canonical four windows: page at 14.4× (1h/5m) and 6× (6h/30m), ticket at 3× (1d/2h) and 1× (3d/6h). An alert fires only when both its long and short window exceed the burn-rate factor.
- **Recording-rule convention** — `<metric>:sli_error:ratio_rate<window>` over each window; burn-rate alerts reference these rather than recomputing inline.
- **The required dashboard** — five rows: an SLO/error-budget row (30d SLI vs objective, budget remaining, fast/slow burn) plus traffic, errors, latency (p50/p95/p99), and saturation.

`tenant-chart-base` renders this standard's shape: a `GrafanaDashboard` CR (reconciled by the grafana-operator onto the external Amazon Managed Grafana, self-contained so it renders against AMP with no ruler), the PrometheusRule (SLI recording rules + the four burn-rate alerts), and the optional ServiceMonitor. Every k8s tenant inherits it with observability **on by default**. The baseline pushes metrics via OTLP to the cluster collector — the standard's accepted "equivalent scrape config" — so the ServiceMonitor is opt-in. Note the delivery split: the dashboard reaches Grafana via the operator on every cluster, while the PrometheusRule is consumed where kube-prometheus-stack runs (the local kx cluster today); the EKS clusters' AMP path has no in-cluster ruler yet, so burn-rate **alerts** there await a rules sink (AMP rule groups or Grafana-managed alerting) even though the **dashboards** are fully live.

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
