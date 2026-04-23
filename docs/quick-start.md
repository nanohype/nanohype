# Quick Start

A template catalog for AI-focused projects. Each template produces a production-ready project skeleton — not boilerplate, but real implementations with provider registries, error handling, tests, and operational tooling. Templates compose into multi-service stacks via composites.

---

## Find your template

### By problem

| You need... | Start with | Add modules |
|---|---|---|
| An AI agent | `agentic-loop` | `eval-harness`, `mcp-server-ts` |
| Document search / RAG | `rag-pipeline` | `module-vector-store`, `module-storage-ts` |
| An HTTP API | `ts-service` | `module-auth-ts`, `module-database-ts` |
| A Go HTTP API | `go-service` | — (auth + db built in) |
| A background worker | `worker-service` | `module-queue-ts`, `module-database-ts` |
| A CLI tool | `go-cli` | `eval-harness` |
| A full-stack AI app | Composite: `ai-web-app` or `ai-chatbot` | — |
| A production platform | Composite: `production-api` | — |
| Multi-agent coordination | `a2a-agent` | `agentic-loop`, `mcp-server-ts` |
| AI safety / content filtering | `guardrails` | `agentic-loop` |
| A Chrome extension with AI | `chrome-ext` | `mcp-server-ts` |
| A VS Code extension | `vscode-ext` | `mcp-server-ts`, `prompt-library` |
| To deploy something | `infra-aws`, `infra-fly`, `infra-gcp`, `infra-vercel`, or `k8s-deploy` | — |

### Not sure?

Browse the [full catalog](catalog.md) for decision matrices by client problem, engagement type, and technical requirement. See the [composites section](#scaffold-a-composite) below for pre-configured multi-template stacks.

---

## Scaffold a template

```bash
npx nanohype scaffold <template> --var ProjectName=my-project
```

For example, to scaffold an autonomous AI agent:

```bash
npx nanohype scaffold agentic-loop --var ProjectName=my-agent
cd my-agent
npm install   # or pnpm install — check package.json for the project's package manager
npm run dev
```

Every template declares its variables in `template.yaml`. Pass them with `--var Key=value`. Variables with defaults can be omitted — the scaffolder fills them in.

To browse all available templates:

```bash
npx nanohype list
```

---

## Scaffold a composite

Composites combine multiple templates into a single project. They handle nesting, variable flow, and conditional inclusion.

```bash
npx nanohype scaffold --composite ai-chatbot --var ProjectName=my-bot
```

This scaffolds the `ai-chatbot` composite, which assembles an `agentic-loop`, `ts-service`, `module-auth-ts`, `module-database-ts`, and `infra-fly` into a ready-to-run stack.

Available composites:

| Composite | What it assembles |
|---|---|
| `proof-of-concept` | Agent + evals — fastest path to a working prototype |
| `ai-chatbot` | Agent + service + auth + deployment |
| `ai-web-app` | Next.js + RAG + auth + database + observability |
| `document-intelligence` | RAG + storage + database |
| `production-api` | Service + auth + database + cache + rate limiting + queue + observability |
| `enterprise-ai` | Agents + RAG + guardrails + evals + K8s |
| `cost-optimized-ai` | LLM gateway + semantic cache + cost monitoring |
| `ai-platform` | Service + gateway + vectors + auth + billing + monitoring |
| `agent-team` | Orchestrator + specialized agents + MCP tools + evals |

See the full list in `composites/` or run `npx nanohype list --composites`.

---

## What you get

Every scaffolded project includes:

- **Bootstrap validation** — catches incomplete scaffolding (missing variable substitutions, unresolved placeholders)
- **Startup config validation** — Zod schemas that fail fast on missing or malformed environment variables (TypeScript templates; Go and Python templates use their own validation patterns)
- **`.env.example`** — documents every environment variable the project needs
- **Structured JSON logging** — production-ready from the start
- **Graceful shutdown handlers** — clean teardown on SIGTERM/SIGINT
- **Tests** — registry validation, business logic, error paths
- **Architecture docs in README** — explains what the project does and how it works

---

## Next steps

- [Full template catalog](catalog.md) — decision matrices, composition map, module layering guide
- [Template contract](spec/template-contract.md) — the formal schema for `template.yaml`
- [Composite contract](spec/composite-contract.md) — multi-template stack manifests
- [Authoring guide](authoring-guide.md) — practical walkthrough for creating new templates
- [SDK reference](../sdk/README.md) — programmatic template discovery, validation, and rendering
- [Consumer implementation guide](spec/consumer-guide.md) — scaffolding algorithm, composite orchestration, catalog integration
