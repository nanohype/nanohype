# nanohype — Claude Code Instructions

## What this repo is

A public, tool-agnostic template catalog for AI-focused projects. Each template under `templates/` has a `template.yaml` contract, a `skeleton/` directory with placeholder tokens, and a `README.md`. Any scaffolding tool can consume these templates.

## Template contract

The formal spec is at `docs/spec/template-contract.md`. The JSON Schema is at `schemas/template.schema.json`. Every `template.yaml` must validate against this schema.

Key rules:

- `apiVersion` is always `nanohype/v1`
- Variable names are PascalCase (`^[A-Z][a-zA-Z0-9]*$`)
- Placeholders are `__SCREAMING_SNAKE__` and appear in file content and filenames
- Conditionals reference variable names directly (not placeholders)
- Bool variables are for conditional file inclusion — their placeholders don't need to appear in skeleton content

## Template categories

Templates are classified by `category` (catalog grouping) and `persona` (who they serve). The `kind` field distinguishes execution mode: `template` (default) scaffolds files directly, `brief` produces agent instruction documents.

### Engineering (persona: engineering)

- **AI Systems** (`ai-systems`) — agentic-loop, rag-pipeline, mcp-server-ts, mcp-server-python, eval-harness, prompt-library, a2a-agent, agent-fleet, guardrails, multimodal-pipeline, fine-tune-pipeline, data-pipeline, agent-orchestrator, ci-eval
- **Applications** (`applications`) — go-cli, ts-service, go-service, next-app, chrome-ext, vscode-ext, slack-bot, discord-bot, electron-app, api-gateway, worker-service
- **Infrastructure** (`infrastructure`) — k8s-app-tenant (primary), landing-zone-component, eks-addon, k8s-deploy (generic-cluster), monorepo, monitoring-stack, infra-druid, infra-aws (escape hatch), infra-fly, infra-vercel, infra-cloudflare
- **Composable Modules** (`composable-modules`) — module-analytics-ts, module-auth-go, module-auth-ts, module-billing-ts, module-cache-ts, module-database-ts, module-feature-flags-ts, module-knowledge-base-ts, module-llm-gateway, module-llm-observability, module-llm-providers, module-media-ts, module-notifications-ts, module-oauth-delegation-ts, module-observability-ts, module-project-mgmt-ts, module-queue-ts, module-rate-limit-ts, module-search-ts, module-semantic-cache, module-spring-security, module-storage-ts, module-vector-store, module-webhook-ts

Module templates (`module-*`) are designed to be layered into other projects, not used standalone.

### Module naming convention

Modules carry an explicit marker identifying their language or framework runtime:

- **Language suffix** for modules that wrap a language-ecosystem's primitives — `-ts` for TypeScript/Node (module-auth-ts, module-database-ts, etc.), `-java` / `-go` / `-py` for future additions following the same pattern.
- **Framework name** when the module configures a specific framework and the framework name is more precise than a generic language marker — e.g. `module-spring-security` configures Spring Security specifically, not "auth for Java."
- **Unsuffixed** for domain-scoped modules that don't have a language-specific implementation — the `module-llm-*` family, `module-vector-store`, `module-semantic-cache`.

The rule: a name should make the runtime assumption obvious from the listing, so a new consumer browsing the catalog can tell what they'd be pulling in without opening the template.

### Non-engineering personas

- **Design** (`design`) — design-system, component-inventory, brand-guidelines, design-tokens
- **QA** (`qa`) — test-plan, acceptance-criteria, test-automation (also engineering), release-checklist
- **Product** (`product`) — prd-template, research-framework, launch-checklist, okr-framework
- **Marketing** (`marketing`) — campaign-brief, content-calendar
- **Sales** (`sales`) — proposal-template, battle-cards
- **Operations** (`operations`) — runbook, compliance-checklist, incident-postmortem, change-management
- **Customer Success** (`customer-success`) — onboarding-playbook, qbr-template

### Agent briefs (kind: brief)

Brief templates scaffold structured agent instruction documents instead of static files. One per non-engineering persona: brief-design-review, brief-test-strategy, brief-prd, brief-campaign-plan, brief-proposal, brief-runbook, brief-onboarding-playbook.

## Working with templates

### Creating a new template

1. Create `templates/<name>/` with `template.yaml`, `skeleton/`, and `README.md`
2. Follow field order: apiVersion, kind, name, displayName, description, version, license, persona, category, tags, variables, conditionals, hooks, composition, prerequisites
3. Use `license: Apache-2.0` for all templates (patent grant protects clients)
4. Hook naming: always use `install-dependencies` as the hook name
5. All templates should include `nestsInside: [monorepo]` in composition (exception: the monorepo template itself uses `nestsInside: []`)
6. README sections in order: "What you get", "Variables", "Project layout", "Pairs with", "Nests inside"

### Choosing persona, category, and kind

- Set `persona` to an array of who the template serves (e.g., `[engineering]`, `[qa, engineering]`). Open vocabulary — no schema constraint.
- Set `category` to the catalog grouping. Use existing values when possible: `ai-systems`, `applications`, `infrastructure`, `composable-modules`, `design`, `qa`, `product`, `marketing`, `sales`, `operations`, `customer-success`.
- Set `kind: brief` only for agent instruction templates. Default (`template`) is for everything that scaffolds files — including non-code documents like design specs or test plans.
- Brief template skeletons should contain at least 500 words of rendered content, structured as: Context, Brief, Output Specification, Quality Criteria.

### Provider registry pattern

All pluggable seams (LLM providers, embedding providers, database drivers, auth providers, etc.) use a consistent registry pattern:

- Define an interface/protocol (e.g., `LlmProvider`, `DatabaseDriver`)
- Each implementation self-registers at import time
- A barrel file imports all implementations to trigger registration
- Consumers call `getProvider(name)` to get an instance

Variables for provider selection use `type: string` (not `enum`) so new providers can be added without changing `template.yaml`. The default value names a built-in provider (e.g., `"anthropic"`).

### Validating

```sh
./scripts/validate.sh templates/<name>    # full validation, single template
npm run validate:schema                    # JSON Schema only, all templates
npm run validate:catalog                   # full catalog validation + summary
```

### Skeleton code quality

- Use latest stable library versions
- Prefer idiomatic patterns for each language (Go stdlib, Python protocols, TS native ESM)
- No LangChain or heavy frameworks — implement patterns directly
- Parameterized queries for SQL (never string interpolation)
- Error handling at tool/provider boundaries
- Type hints in Python, strict mode in TypeScript

### Skeleton toolchain

Every JavaScript skeleton ships a `biome.json` and declares `@biomejs/biome`;
`lint`, `format` and `format:check` invoke Biome. The config is
`library/config/biome.base.json` inlined rather than extended, because a
scaffolded project has no nanohype checkout to extend from — only `$schema`,
`files` and `css` may differ per template.

Two gates hold it, both run by `validate-templates.yml`:

```sh
npm run validate:skeleton-toolchain   # every skeleton carries the shared config
npm run lint:skeletons                # and its code passes it
```

The second exists because the root `biome.json` excludes `templates/*/skeleton`
— a skeleton is scaffolding output with its own root and config, so nothing else
in this repository reads it. `npm run lint` has to pass on a scaffolded
project's first commit, and `lint:skeletons` runs the same command, from the
same directory, against the same config a consumer gets.

## Style

- 2-space indent for YAML, JSON, TypeScript, Markdown
- 4-space indent for Python
- Tabs for Go and Makefiles
- LF line endings everywhere
- No trailing whitespace (except Markdown for line breaks)

## CLI

`cli/` contains `nanohype` — the unscoped package, and the one `npx nanohype`
resolves to. It holds no scaffolding logic: it locates the `nanohype` bin
inside `@nanohype/sdk` and runs it as a child process, so argv, exit codes and
signals belong to the SDK.

It exists because npm's unscoped namespace is separate from the `@nanohype`
scope — owning the scope does not reserve the bare name, and `npx nanohype` is
what people reach for. A name left unclaimed there is a name someone else can
publish under.

The path arithmetic lives in `src/resolve.ts` rather than in the entry point,
because that is the part which breaks silently if the SDK moves its bin — the
SDK's `exports` map declares only `"."`, so the bin is reached as a filesystem
path rather than a subpath import. `cli.yml` runs the built binary against the
installed SDK, since every other check passes on a wrapper that resolves to
nothing.

Released on a `cli-v*` tag through the shared `release.yml`.

## Error pages

`error-pages/` contains `@nanohype/error-pages` — a JS-free 404/500 renderer
and a checker for the contract those pages have to meet: `noindex`, no
JavaScript, and same-origin styling only. The three exist because an error page
is served exactly when something else is broken, so it cannot depend on the app
bundle, and a strict `style-src 'self'` CSP will drop anything inline.

It renders from `@nanohype/tokens` and takes no theme argument. A site whose
error page drifted from its own palette is precisely what a shared package
should make impossible.

One inversion worth knowing: `tokens.css` ships dark in `:root` with
`html.light` overriding, because an app can run a pre-paint script and choose.
An error page cannot — `script-src 'self'` blocks that script, and the visitor
often arrives with empty `localStorage`. So the generated stylesheet puts light
in `:root` and dark behind `prefers-color-scheme`.

`error-pages.yml` runs the built binary end to end: generate, check what was
generated, then confirm the checker rejects a page containing a `<script>`.
Every other check passes on a package whose two halves disagree.

Released on an `error-pages-v*` tag through the shared `release.yml`.

## SDK

`sdk/` contains `@nanohype/sdk` — the reference implementation of the template rendering contract. It's a standalone TypeScript package with no dependencies on any consumer.

```sh
cd sdk
npm install
npm run typecheck    # type-check
npm run build        # compile to dist/
npm test             # run tests
```

Key modules:

- `src/types.ts` — all type interfaces (TemplateManifest, CompositeManifest, etc.)
- `src/source.ts` — `CatalogSource` interface for pluggable template discovery
- `src/sources/github.ts` — `GitHubSource` (reads from GitHub API)
- `src/sources/local.ts` — `LocalSource` (reads from filesystem)
- `src/validator.ts` — `validateManifest()`, `validateCompositeManifest()`
- `src/resolver.ts` — `resolveVariables()` (defaults, cross-refs, validation)
- `src/renderer.ts` — `renderTemplate()` (the 10-step scaffolding algorithm)
- `src/composite.ts` — `renderComposite()` (multi-template orchestration)

The SDK bundles its own copy of `schemas/template.schema.json`. CI verifies the two copies stay in sync.

## Diagrams

Diagrams are Excalidraw source files in `docs/diagrams/src/` with SVG exports in `docs/diagrams/svg/`. Edit the `.excalidraw` source, re-export the SVG.
