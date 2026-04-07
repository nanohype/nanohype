# Composites Guide

## What are composites?

A composite scaffolds multiple templates into one integrated project. Instead of running `npx nanohype scaffold` five times and wiring things together by hand, a composite does it in a single command -- it picks the right templates, nests them into a monorepo (or flat structure), flows shared variables to each one, and respects conditional flags so you only get the pieces you asked for.

Individual templates are building blocks. Composites are the blueprints that assemble them into real project architectures.

---

## Selection guide

| Composite | What it produces | Templates | Best for |
|---|---|---|---|
| `proof-of-concept` | Minimal AI agent with eval harness | 2 | Quick POC -- validate an idea in days, not weeks |
| `ai-chatbot` | Full-stack chatbot with auth, evals, deployment | 6 | Customer-facing conversational AI |
| `ai-web-app` | Next.js frontend with RAG, auth, database, observability | 8 | AI-powered web applications with document search |
| `production-api` | TypeScript API with auth, DB, caching, rate limiting, queue, observability | 9 | Backend services that need to be production-grade from day one |
| `enterprise-ai` | Agents, RAG, guardrails, evals, prompts, storage, K8s deploy | 15 | Full enterprise AI platform with all the operational layers |
| `multi-agent` | A2A orchestrator, agent, MCP tools, guardrails, evals | 8 | Systems where multiple AI agents collaborate and delegate |
| `rag-agent` | Agent with RAG pipeline, storage, database, evals | 8 | AI agents that need grounded knowledge from documents |
| `document-intelligence` | RAG pipeline, API service, storage, database, evals | 7 | Document search and question-answering systems |
| `background-processor` | Worker service with queue, database, storage, observability | 7 | Async job processing without synchronous HTTP |
| `safe-ai-agent` | Agent with guardrails, evals, prompt library | 5 | Responsible AI -- input filtering, output validation, testing |
| `eval-suite` | Eval harness, prompt library, guardrails validation | 4 | Testing AI systems without building them |
| `go-microservice` | Go HTTP service with evals and deployment | 3 | Lightweight, single-binary Go services |
| `mcp-toolkit` | MCP server with prompts and evals | 3 | Building tool servers for AI systems |
| `chrome-ai-extension` | Chrome extension with MCP tools and prompt library | 3 | Browser extensions with AI sidepanel |
| `vscode-ai-extension` | VS Code extension with MCP tools and prompt library | 3 | Editor extensions with AI integration |
| `internal-tool` | CLI or extension backed by MCP servers | 4 | Internal team tooling |
| `cost-optimized-ai` | LLM gateway with cost routing, semantic caching, observability | 4 | Minimizing LLM spend with smart routing and caching |
| `ai-platform` | Monorepo with service, gateway, vectors, pipeline, auth, database, billing, monitoring | 9 | Full AI product with usage-based billing |
| `agent-team` | Orchestrator, specialized agents, MCP tools, evals | 6 | Multi-agent systems with distinct roles |
| `client-engagement` | Proposal, battle cards, brand guidelines, campaign brief, onboarding playbook | 5 | Non-engineering client engagement workflows |
| `product-launch` | Next.js app, design system, tokens, test plan, acceptance criteria, PRD, campaign, runbook | 10 | Cross-functional product launches spanning eng through marketing |
| `research-to-prototype` | PRD, agentic loop prototype, optional test plan | 3 | Research-driven prototyping from idea to validated POC |

---

## How to scaffold a composite

```bash
npx nanohype scaffold --composite ai-chatbot --var ProjectName=my-bot
```

The scaffolder reads the composite YAML, collects composite-level variables once, then distributes them to each template entry. Entry-level overrides can transform variable values -- for example, the `ai-chatbot` composite takes `ProjectName=my-bot` and passes `my-bot-api` to the API service and `my-bot-ai` to the agentic loop.

To see all available composites before scaffolding:

```bash
npx nanohype list --composites
```

Conditional entries are controlled by boolean variables. For example, `production-api` has `IncludeQueue` (default `true`) and `IncludeCache` (default `true`). To skip the queue:

```bash
npx nanohype scaffold --composite production-api \
  --var ProjectName=my-api \
  --var IncludeQueue=false
```

---

## Post-scaffold wiring

### proof-of-concept

- Run `npm install` at the project root, then `npm run dev` to start the agent in watch mode
- Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` if you chose OpenAI as the provider)
- The agent loop lives in `src/agent.ts` -- edit the system prompt and tool definitions there
- Add new tools by creating files in `src/tools/` and registering them in the tool index
- Run `npm run eval` to execute the eval suite in `evals/` -- add fixtures as JSON files
- Tune `MAX_ITERATIONS` to control how many tool-call rounds the agent can take
- When the eval suite passes, you have a solid foundation to build the real thing on

### ai-chatbot

- Run `pnpm install` at the monorepo root to install all workspace dependencies
- Start the API server: `pnpm --filter *-api dev` (runs on the port defined in `.env`)
- Set LLM API keys in `apps/api/.env` -- the agentic loop in `packages/ai/` reads them at runtime
- The frontend is not included -- wire your own UI to `POST /api/chat` on the API service
- Auth is JWT-based via `packages/auth/` -- generate tokens with the auth module's helpers
- If you enabled evals, run `pnpm --filter *-evals eval` to validate agent behavior
- Deploy with `cd infra && fly deploy` after configuring `fly.toml` with your app name and secrets

### production-api

- Run `pnpm install`, then `pnpm --filter *-api dev` to start the API server
- Set up your database: configure `DATABASE_URL` in `.env`, run the Drizzle migration (`pnpm --filter *-db migrate`)
- Auth tokens are JWT -- set `JWT_SECRET` to a strong random value (the config validator rejects the placeholder)
- The cache layer (`packages/cache/`) defaults to in-memory -- switch to Redis by setting `CACHE_PROVIDER=redis` and `REDIS_URL`
- The queue (`packages/queue/`) uses BullMQ by default -- requires `REDIS_URL` for the broker
- Rate limiting (`packages/rate-limit/`) uses token-bucket -- configure per-route limits in the middleware setup
- Observability (`packages/observability/`) exports to OTLP -- set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector
- Deploy with `cd infra && fly deploy` or swap the `infra/` directory for `infra-aws` / `k8s-deploy`

### enterprise-ai

- This is the largest composite -- not every component is required for every deployment
- Start minimal: get the API (`apps/api/`), agent (`packages/agent/`), and database (`packages/db/`) running first
- RAG (`packages/rag/`) and A2A orchestration (`packages/orchestrator/`) are conditional -- skip them if you do not need retrieval or multi-agent coordination
- Guardrails (`packages/guardrails/`) run as middleware -- wire them into the API's request pipeline to filter inputs and validate outputs
- The prompt library (`packages/prompts/`) versions your system prompts -- use it from the agent and eval harness
- Storage (`packages/storage/`) defaults to S3 -- set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET`
- Deploy to Kubernetes with `cd infra && helm install` -- the K8s deploy template includes HPA, ingress, and CI manifests
- Scale by splitting services: run the API, agent workers, and RAG indexer as separate deployments behind the queue

### multi-agent

- Run `pnpm install` at the monorepo root, then start the API: `pnpm --filter *-api dev`
- The A2A orchestrator (`packages/orchestrator/`) coordinates agent-to-agent communication -- it discovers peers and delegates tasks
- The agentic loop (`packages/agent/`) is a single agent implementation -- duplicate it under a new name to add more agent types
- MCP tools (`packages/tools/`) are shared across agents via stdio transport -- register new tools in the server's tool index
- If guardrails are enabled, wire them into the orchestrator's request pipeline to filter inter-agent messages
- Run evals with `pnpm --filter *-evals eval` -- test both individual agent behavior and multi-agent coordination scenarios
- Deploy to AWS ECS via the `infra/` directory -- each agent type can run as a separate ECS service behind the VPC

### cost-optimized-ai

- Run `pnpm install` at the monorepo root
- The LLM gateway (`packages/gateway/`) routes requests to the cheapest provider that meets quality thresholds -- configure routing rules in its config
- The semantic cache (`packages/cache/`) deduplicates similar prompts -- set `OPENAI_API_KEY` for the embedding model
- The observability package (`packages/observability/`) tracks token usage and cost per request -- wire it into your API layer
- Tune the similarity threshold in the cache config to balance cost savings against freshness

### ai-platform

- Run `pnpm install`, then `pnpm --filter *-api dev` to start the API server
- Configure `DATABASE_URL` and run migrations via `pnpm --filter *-db migrate`
- The LLM gateway (`packages/gateway/`) manages provider routing -- set API keys for your chosen providers
- The data pipeline (`packages/pipeline/`) handles document ingestion into the vector store
- If billing is enabled, configure Stripe keys in `packages/billing/.env` -- usage metering is automatic
- The monitoring stack (`infra/monitoring/`) provides Prometheus, Grafana, and Loki -- deploy with `cd infra/monitoring && docker compose up`

### agent-team

- Run `pnpm install` at the monorepo root
- The orchestrator (`packages/orchestrator/`) coordinates the researcher and writer agents -- configure agent roles and delegation rules in its config
- Each agent (`packages/agents/researcher/`, `packages/agents/writer/`) is an independent agentic loop with its own system prompt and tools
- MCP tools (`packages/tools/`) are shared across agents via stdio transport -- add new tools in the server's tool index
- Run `pnpm --filter *-evals eval` to validate agent behavior -- add multi-agent coordination test cases
- To add a new agent role, duplicate an existing agent directory and register it with the orchestrator

### client-engagement

- No engineering templates -- this composite is entirely non-code deliverables
- Start with the proposal (`proposal/`) and battle cards (`battle-cards/`) for the sales pitch
- Brand guidelines (`brand-guidelines/`) define visual identity for all client-facing materials
- The campaign brief (`campaign-brief/`) ties marketing to the engagement goals
- If onboarding is enabled, the playbook (`onboarding-playbook/`) covers post-sale customer setup

### product-launch

- Run `pnpm install` at the monorepo root
- The Next.js app (`apps/web/`) is the engineering deliverable -- start with `pnpm --filter *-web dev`
- Design system (`packages/design-system/`) and tokens (`packages/design-tokens/`) define the visual language
- QA artifacts (test plan, acceptance criteria) live alongside the PRD in `docs/`
- The campaign brief and runbook are in `docs/` -- hand these to marketing and operations respectively
- This composite spans engineering, design, QA, product, marketing, and operations personas

### research-to-prototype

- Start with the PRD (`docs/prd/`) to define the research question and success criteria
- The agentic loop prototype (`src/`) is a minimal AI agent -- edit the system prompt and tools to match the research hypothesis
- If the test plan is enabled (`docs/test-plan/`), use it to define validation criteria before building
- Run `npm install && npm run dev` to start iterating on the prototype
- When the prototype validates the hypothesis, graduate to a full composite like `ai-chatbot` or `enterprise-ai`

---

## Creating your own composites

Composites are YAML files in `composites/` at the catalog root. See [docs/spec/composite-contract.md](spec/composite-contract.md) for the full specification.

Minimal structure:

```yaml
apiVersion: nanohype/v1
kind: composite
name: my-stack
displayName: "My Stack"
description: >
  What this composite produces and who it is for.
version: "0.1.0"
tags: [relevant, searchable, tags]

variables:
  - name: ProjectName
    type: string
    placeholder: "__PROJECT_NAME__"
    description: "Project name"
    required: true
    validation:
      pattern: "^[a-z][a-z0-9-]*$"
      message: "Must be lowercase kebab-case"

templates:
  - template: monorepo
    root: true
    variables:
      ProjectName: "${ProjectName}"

  - template: ts-service
    path: apps/api
    variables:
      ProjectName: "${ProjectName}-api"
```

Key rules:

- At most one entry can be `root: true` -- its skeleton forms the top-level directory.
- Entry variables reference composite variables with `${VarName}` syntax.
- Use `condition: SomeBoolVar` on an entry to make it optional.
- Templates are scaffolded in array order -- put the root first, then dependencies before dependents.
