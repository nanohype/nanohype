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

Templates fall into four categories:

- **AI Systems** — agentic-loop, rag-pipeline, mcp-server-ts, mcp-server-python, eval-harness, prompt-library, a2a-agent, guardrails, multimodal-pipeline, fine-tune-pipeline, data-pipeline, agent-orchestrator, ci-eval
- **Applications** — go-cli, ts-service, go-service, next-app, chrome-ext, vscode-ext, slack-bot, discord-bot, electron-app, api-gateway, worker-service
- **Infrastructure** — infra-aws, infra-fly, infra-gcp, infra-vercel, k8s-deploy, monorepo, monitoring-stack, infra-druid, infra-cloudflare
- **Composable Modules** — module-auth, module-database, module-observability, module-storage, module-queue, module-cache, module-rate-limit, module-webhook, module-notifications, module-llm-gateway, module-vector-store, module-semantic-cache, module-llm-observability, module-billing, module-feature-flags

Module templates (`module-*`) are designed to be layered into other projects, not used standalone.

## Working with templates

### Creating a new template

1. Create `templates/<name>/` with `template.yaml`, `skeleton/`, and `README.md`
2. Follow field order: apiVersion, name, displayName, description, version, license, tags, variables, conditionals, hooks, composition, prerequisites
3. Use `license: Apache-2.0` for all templates (patent grant protects clients)
4. Hook naming: always use `install-dependencies` as the hook name
5. All templates should include `nestsInside: [monorepo]` in composition (exception: the monorepo template itself uses `nestsInside: []`)
6. README sections in order: "What you get", "Variables", "Project layout", "Pairs with", "Nests inside"

### Provider registry pattern

All pluggable seams (LLM providers, embedding providers, database drivers, auth providers, etc.) use a consistent registry pattern:

- Define an interface/protocol (e.g., `LlmProvider`, `DatabaseDriver`)
- Each implementation self-registers at import time
- A barrel file imports all implementations to trigger registration
- Consumers call `getProvider(name)` to get an instance

Variables for provider selection use `type: string` (not `enum`) so new providers can be added without changing `template.yaml`. The default value names a built-in provider (e.g., `"anthropic"`).

### Validating

```sh
./scripts/validate.sh templates/<name>    # full validation
npm run validate:schema                    # JSON Schema only, all templates
```

### Skeleton code quality

- Use latest stable library versions
- Prefer idiomatic patterns for each language (Go stdlib, Python protocols, TS native ESM)
- No LangChain or heavy frameworks — implement patterns directly
- Parameterized queries for SQL (never string interpolation)
- Error handling at tool/provider boundaries
- Type hints in Python, strict mode in TypeScript

## Style

- 2-space indent for YAML, JSON, TypeScript, Markdown
- 4-space indent for Python
- Tabs for Go and Makefiles
- LF line endings everywhere
- No trailing whitespace (except Markdown for line breaks)

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
