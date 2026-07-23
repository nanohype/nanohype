# Platform Reference

The public, agent-consumable surface of the nanohype stack. If you're building an AI client — a Bedrock agent, a Claude Code session, a custom orchestrator, an OpenAI Assistant, anything that produces software — and you want it to deliver shipped k8s-native applications, start here.

This page is the front door. Everything else (catalog manifest, standards, per-repo agent docs, the SDK, the MCP server) is one link away.

## Who this is for

You're building an AI client that needs to:

- Discover what templates and composites are available (`catalog.json`, the SDK, or `@nanohype/mcp`)
- Understand the production bar every build is measured against (`standards/`)
- Know the shape of the deploy substrate (`AGENTS.md` in each supporting repo)
- Render templates programmatically without re-implementing the scaffolding contract (`@nanohype/sdk`)
- Optionally, expose all of the above as MCP tools to its own LLM (`@nanohype/mcp`)

If you're a human reading this looking for "how do I use the templates," skip down to **Quickstart**. If you're an agent author looking for "what's the architecture," start with **The stack** below.

## The stack

Nine public repos form the system: the catalog you're reading, the deploy substrate it targets, the tooling that operates that substrate, and `fab` — the reference factory client, open-source so you can clone it, configure your skills overlay, and run your own factory.

Each one ships an `AGENTS.md` at its root. The machine-readable list is the SDK's `CONTRACT_REPOS`, and `loadContract(repo)` fetches any of them.

| Repo                                                                            | Role                                                                                                                                                                                                                                                                                                                                                                 | Agent entry point              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| [`nanohype/nanohype`](https://github.com/nanohype/nanohype)                     | Template catalog + SDK + the public Platform Reference itself (this file)                                                                                                                                                                                                                                                                                            | [`AGENTS.md`](../AGENTS.md)    |
| [`nanohype/landing-zone`](https://github.com/nanohype/landing-zone)             | OpenTofu/Terragrunt monorepo. Cloud substrate: VPC, base IAM, KMS, observability, and the generic `tenant-substrate` module that provisions a tenant's datastores from `Platform.spec.datastores`                                                                                                                                                                                                                                                | `landing-zone/AGENTS.md`       |
| [`nanohype/eks-gitops`](https://github.com/nanohype/eks-gitops)                 | ArgoCD addon catalog for EKS clusters (App-of-Apps pattern)                                                                                                                                                                                                                                                                                                          | `eks-gitops/AGENTS.md`         |
| [`nanohype/eks-agent-platform`](https://github.com/nanohype/eks-agent-platform) | k8s-native control plane. Owns the `Platform` / `AgentFleet` / `ModelGateway` / `BudgetPolicy` / `EvalSuite` CRDs                                                                                                                                                                                                                                                    | `eks-agent-platform/AGENTS.md` |
| [`nanohype/eks-fleet`](https://github.com/nanohype/eks-fleet) | Cluster factory. Vends EKS clusters via Crossplane from a `Cluster` API | `eks-fleet/AGENTS.md` |
| [`nanohype/kx`](https://github.com/nanohype/kx)                                 | Local kind workspace that mirrors `eks-gitops`. Run the same charts locally before deploying                                                                                                                                                                                                                                                                         | `kx/AGENTS.md`                 |
| [`nanohype/cloudgov`](https://github.com/nanohype/cloudgov) | AWS security & cost governance CLI. IAM least-privilege, cost, infrastructure hygiene, security posture, plus a Platform-tenant conformance auditor | `cloudgov/AGENTS.md` |
| [`nanohype/portal`](https://github.com/nanohype/portal) | Self-hosted operations portal. Go API + React SPA that runs the cloud substrate from one UI with one audit trail | `portal/AGENTS.md` |
| [`nanohype/fab`](https://github.com/nanohype/fab)                               | Reference factory client. Orchestrates 80 Claude agents across Discovery → Design → Build → Verify → Ship. Four transports, selected by `FAB_RUNTIME`. Ships baseline skills (quality-check, factory-preamble, intake-guide, 31 curator/engineer baselines); overlay your personal recipe via `~/.fab/skills/` | `fab/skills/README.md`         |

The boundary between layers:

- **Slow-moving cloud infra** (VPC, base IAM, KMS keys, cost pipeline, EventBridge, WAF) → `landing-zone`
- **Per-tenant identity + access** (the tenant IAM role, its scoped datastore-access policy generated from `spec.datastores`, KMS grants, Bedrock model-access) → `eks-agent-platform` operator reconciles via AWS SDK
- **Per-tenant stateful substrate** (databases, buckets, queues, caches, streams) → declared in `Platform.spec.datastores`, provisioned by the generic `tenant-substrate` landing-zone module — no per-app component
- **Cluster addons** (cert-manager, external-secrets, Kyverno, observability) → `eks-gitops`
- **Local development** → `kx` (kind cluster mirroring eks-gitops)
- **Application logic** → templates from `nanohype/templates/` scaffolded into an `<app>/chart/` + `<app>/platform.yaml`

If you find yourself producing cloud resources inside an application chart, you're in the wrong layer.

## Catalog

The machine-readable index of every template and composite is committed at the repo root as [`catalog.json`](../catalog.json). Stable GitHub raw URL for fetch-from-anywhere consumers:

```text
https://raw.githubusercontent.com/nanohype/nanohype/main/catalog.json
```

Validated against [`schemas/catalog.schema.json`](../schemas/catalog.schema.json) on every PR. Re-generated deterministically by `npm run generate:catalog`.

**Templates** (`templates/<name>/`) scaffold files directly. The full contract is in [`docs/spec/template-contract.md`](spec/template-contract.md); the rendering algorithm is in [`docs/spec/consumer-guide.md`](spec/consumer-guide.md). Categories: `ai-systems`, `applications`, `infrastructure`, `composable-modules`, plus non-engineering personas (`design`, `qa`, `product`, `marketing`, `sales`, `operations`, `customer-success`).

**Composites** (`composites/*.yaml`) are pre-baked multi-template stacks for common engagement shapes (`agent-team`, `ai-chatbot`, `enterprise-ai`, etc.). The composite contract is in [`docs/spec/composite-contract.md`](spec/composite-contract.md).

## Standards

The production bar every build meets, in machine-readable JSON under [`standards/`](../standards/):

| File                                                                            | What it declares                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`language-toolchain.json`](../standards/language-toolchain.json)               | Per-language `{install, build, lint, test, docs}` command sets + manifest, lockfile, registry, version-lookup                                                                            |
| [`version-currency.json`](../standards/version-currency.json)                   | EOL policy, version floor, accepted `@pin` reasons, per-language registries                                                                                                              |
| [`platform-tenant-contract.json`](../standards/platform-tenant-contract.json)   | The required artifacts (chart, ApplicationSet entry, Platform CR), the minimum Platform CR shape, OTel resource attrs, and what NOT to do                                                |
| [`llm-policy.json`](../standards/llm-policy.json)                               | Bedrock-primary, IRSA auth, model tiers (sonnet default / opus escalation / haiku light), region preferences, prompt-caching requirement                                                 |
| [`quality-rubric-dimensions.json`](../standards/quality-rubric-dimensions.json) | The ten quality dimensions every build is graded against. Dimension names + summaries only — the weights, reviewer assignments, and merge-gate enforcement live in the reference client |
| [`testing-rubric.json`](../standards/testing-rubric.json)                       | The testing-strategy bar — per-language coverage floors enforced in-config, the testing-trophy shape, and `security-critical-100` (100% on audit ledgers, auth, and approval gates)      |
| [`resource-tagging.json`](../standards/resource-tagging.json) | The org-wide tag/label taxonomy every cloud resource and k8s object carries — vendor-neutral dimensions, per-surface rendering (AWS tags, k8s labels, OTel attributes), casing transforms, required tiers |
| [`resource-naming.json`](../standards/resource-naming.json) | The naming grammar for cloud and k8s resources — the env-first cloud vs. environment-token-free k8s split, the cluster-identity model, reserved environment values, collision + length guards |
| [`observability-slo.json`](../standards/observability-slo.json) | RED for services, USE for resources, the four golden signals, and at least one SLO with a multi-window multi-burn-rate error budget. Fixes the dashboard a system ships to represent itself |
| [`seo-baseline.json`](../standards/seo-baseline.json) | The discovery surface every public site the factory ships presents — canonical-host rule, required files (robots.txt, sitemap.xml, llms.txt, og.png), required head tags |

Each file is validated against [`schemas/standards.schema.json`](../schemas/standards.schema.json). [`standards/README.md`](../standards/README.md) is the human-readable normative form.

**What's intentionally not in this directory**: the merge-gate choreography, the rubric weights and per-reviewer assignments, the agent roster, the factory preamble prompt, and the orchestration code that produces consistent output against this bar. Those live in the reference client. The cut is deliberate — publishing the guardrails everyone has to meet, keeping the choreography that consistently hits them.

## Deploy contracts

Each repo in the stack has an `AGENTS.md` at its root — short, agent-facing, answers "what does this repo give me and how do I add a new thing here." Read these in order if you're learning the stack cold:

1. [`nanohype/AGENTS.md`](../AGENTS.md) — templates + SDK + catalog. The starting point.
2. `eks-agent-platform/AGENTS.md` — the CRD surface. Platform / AgentFleet / ModelGateway / BudgetPolicy / EvalSuite. How to declare a tenant.
3. `landing-zone/AGENTS.md` — cloud substrate. The `tenant-substrate` module driven by `Platform.spec.datastores`. Pod Identity setup.
4. `eks-gitops/AGENTS.md` — addon catalog. ApplicationSet entry shape. Sync waves.
5. `eks-fleet/AGENTS.md` — the `Cluster` API. How a cluster gets vended.
6. `kx/AGENTS.md` — local kind mirror. When to use it.
7. `cloudgov/AGENTS.md` — the governance checks your output is audited against.
8. `portal/AGENTS.md` — the operations surface over the substrate.
9. `fab/AGENTS.md` — the reference factory client, if you're studying how one consumes all of the above.

If you're skipping straight to delivery, only `eks-agent-platform/AGENTS.md` is mandatory — its Platform CR is what your output must conform to.

## SDK

`@nanohype/sdk` is the reference TypeScript implementation of the catalog + standards consumption pattern. One runtime dependency (a YAML parser).

```typescript
import { LocalSource, loadCatalog, loadStandards, renderTemplate } from '@nanohype/sdk';

// Discovery
const source = new LocalSource('/path/to/nanohype-repo');
const catalog = await loadCatalog(source);
const standards = await loadStandards(source);

// Selection (your client decides which template fits)
const templateName = catalog.templates.find(
  (t) => t.category === 'ai-systems' && t.tags.includes('rag'),
)?.name;

// Render
await renderTemplate({
  source,
  templateName,
  outputDir: '/path/to/output',
  variables: { ProjectName: 'my-rag-bot', LlmProvider: 'anthropic' },
});
```

For agents running remotely without a checkout, use `GitHubSource` instead — same API, fetches manifests from the GitHub API.

`loadStandards()` returns a typed bundle covering all ten standards files. `loadContract(repo)` fetches the corresponding `AGENTS.md` so your agent can present the deploy contract for any specific repo. See [`docs/spec/consumer-guide.md`](spec/consumer-guide.md) for the full rendering algorithm.

## MCP server

For agents running inside Claude Desktop, Claude API tool-use, or an MCP-capable runtime (some Bedrock agent configurations), `@nanohype/mcp` exposes the whole reference as MCP resources and tools.

```jsonc
// Claude Desktop config snippet (claude_desktop_config.json)
{
  "mcpServers": {
    "nanohype": {
      "command": "npx",
      "args": ["-y", "@nanohype/mcp"],
    },
  },
}
```

Resources: `nanohype://catalog`, `nanohype://standards`, `nanohype://standards/{name}`, `nanohype://contracts/{repo}`, `nanohype://template/{name}`, `nanohype://composite/{name}`.

Tools: `search_templates(query, category?, persona?)`, `get_template(name)`, `get_composite(name)`, `list_standards()`, `get_standard(name)`, `get_contract(repo)`.

Full integration snippets for Claude Desktop, Claude API tool-use, and AWS Bedrock agent registration live in the MCP package's own README.

## Reference client

[`fab`](https://github.com/nanohype/fab) is the open-source reference implementation of "AI client consuming this Platform Reference to produce shipped software." Clone it to study, fork it to extend, or — most likely — install it and configure a personal **skill overlay** to layer your opinions on top without forking.

Fab runs the same workflows against four transports:

- **`managed-agents`** (default) — Anthropic-hosted REST API. Sessions + sandboxes live on Anthropic infrastructure.
- **`sdk`** — `@anthropic-ai/claude-agent-sdk` running the agent loop in fab's own process.
- **`sdk-k8s`** — the `sdk` loop, each role-session dispatched as its own isolated pod on the eks-agent-platform substrate.
- **`claude-cli`** — a `claude -p` subprocess per role-session, billed against your Claude subscription.

Pick by setting `FAB_RUNTIME=managed-agents | sdk | sdk-k8s | claude-cli`. All four are behaviorally 1:1 for the application-level workflow flow; transport-level trade-offs (durability, sandboxing, deploy step, threading) are documented in [`fab/docs/transports.md`](https://github.com/nanohype/fab/blob/main/docs/transports.md).

The overlay system. Fab ships baseline skills (`quality-check`, `factory-preamble`, `intake-guide`, role briefs) as markdown files in `fab/skills/`. When loading a skill, fab walks four locations in priority order — `$FAB_SKILLS_DIR` → `~/.fab/skills/` → `<cwd>/.fab/skills/` → bundled — and the first match wins as the base. `<skill>.append.md` files from every layer get concatenated for additive overlays. Result: anyone can clone fab and run a competent factory; your personal overlay at `~/.fab/skills/` produces _your_ factory.

What fab does, broadly:

1. Accepts an intake brief conforming to [`fab.schema.json`](https://github.com/nanohype/fab/blob/main/fab.schema.json)
2. Loads the public standards via the SDK (and adds private review-process layers on top)
3. Selects templates from the catalog based on the brief
4. Renders the selected templates + plans the multi-template composition
5. Orchestrates 80 Claude agents across Discovery → Design → Build → Verify → Ship phases
6. Produces a PR that meets the production bar, with evidence

Your client doesn't have to be 80 agents. A single Claude session that reads the catalog, picks one template, renders it, and meets the bar is a conformant client. The reference exists to show the upper bound, not set the minimum.

## Quickstart: build your own client

The minimum-viable client:

1. **Fetch the catalog**: `curl https://raw.githubusercontent.com/nanohype/nanohype/main/catalog.json`. Parse it to get the list of available templates and composites.
2. **Load the standards**: same URL pattern for `standards/*.json`. Your client now knows the production bar.
3. **Pick a template**: choose by category, persona, or tags. For most AI workloads, start with a composite like `ai-chatbot` or `agent-team` from `composites/`.
4. **Render via the SDK**: `import { renderTemplate, GitHubSource } from "@nanohype/sdk"`. Or implement the [consumer-guide](spec/consumer-guide.md) algorithm in your language of choice — it's ~150 lines of string-replacement, no template engine needed.
5. **Conform to the platform-tenant contract**: produce a Helm chart in `<app>/chart/` + ApplicationSet entry + Platform CR. The shape is in `standards/platform-tenant-contract.json`.
6. **Hit the bar**: ensure the rendered output exposes the four phases (build/lint/test/docs), uses current-stable versions, ships with OTel resource attrs, and passes the ten quality-rubric dimensions.

That's the conformant client. Everything fab does on top — multi-agent orchestration, merge-gate enforcement, evidence-bound verdicts — is the choreography that makes the bar consistently reachable, not a separate bar.

## Versioning

Every public artifact carries a `version` field (positive integer = major version). Bump on any breaking shape change. Backwards-compatible additions don't bump. Pin your client to a major version range; minor evolution is non-breaking by construction.

Current versions:

- `catalog.json`: v1
- `standards/*.json`: v1 each (all ten)
- `@nanohype/sdk`: see [`sdk/package.json`](../sdk/package.json)
- `@nanohype/mcp`: see [`mcp-server/package.json`](../mcp-server/package.json)

## Reusing this pattern

The structure described here (top-level reference doc + machine-readable manifests + per-repo `AGENTS.md` + SDK + MCP server) is portable. If you want to publish a similar Platform Reference for your own org or project, [`docs/platform-reference-pattern.md`](platform-reference-pattern.md) describes how — and there's a `templates/platform-reference/` template that scaffolds the structure for new orgs.

## See also

- [Consumer guide](spec/consumer-guide.md) — the template-rendering algorithm
- [Template contract](spec/template-contract.md) — field-by-field reference
- [Composite contract](spec/composite-contract.md) — multi-template stack manifests
- [Standards README](../standards/README.md) — human-readable normative bar
- [Catalog JSON](../catalog.json) — machine-readable catalog
