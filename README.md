# nanohype

A tool-agnostic template catalog for AI-focused projects. Each template is a self-contained, scaffoldable starting point — consumable by any scaffolding tool that reads the [template contract](docs/spec/template-contract.md).

**New here?**

- **Building an AI client** (Bedrock agent, Claude session, custom orchestrator) and want to ship software on this stack? Start with the [Platform Reference](docs/platform-reference.md) and the per-repo [AGENTS.md](AGENTS.md).
- **Scaffolding a project locally**? Start with the [Quick Start guide](docs/quick-start.md) — find the right template, scaffold it, and run it in under 2 minutes.

## Templates

Templates span four engineering categories plus composable modules. Beyond engineering, the catalog also carries cross-functional templates and agent briefs for design, QA, product, marketing, sales, operations, and customer success — see [Cross-Functional Templates](#cross-functional-templates) below.

### AI Systems

| Template | Description | Tags |
|---|---|---|
| [agentic-loop](templates/agentic-loop/) | Autonomous agent with tool registry, memory, provider abstraction, eval harness | `typescript` `agent` `llm` |
| [rag-pipeline](templates/rag-pipeline/) | TypeScript RAG pipeline with chunking, embedding, vector store, retrieval, generation | `typescript` `rag` `embeddings` |
| [mcp-server-ts](templates/mcp-server-ts/) | TypeScript MCP server with tool/resource registration and Zod validation | `mcp` `typescript` `tools` |
| [mcp-server-python](templates/mcp-server-python/) | Python MCP server with tool/resource registration | `mcp` `python` `tools` |
| [eval-harness](templates/eval-harness/) | Standalone LLM evaluation framework with YAML suites, assertions, and reporters | `typescript` `eval` `testing` |
| [prompt-library](templates/prompt-library/) | Versioned prompt management with YAML frontmatter and optional TypeScript SDK | `prompts` `yaml` `versioning` |
| [a2a-agent](templates/a2a-agent/) | Agent-to-Agent protocol peer with skill registry, transport abstraction, and discovery | `typescript` `a2a` `agents` |
| [guardrails](templates/guardrails/) | Input/output safety filters — prompt injection, PII, content policy, token limits | `typescript` `safety` `filters` |
| [multimodal-pipeline](templates/multimodal-pipeline/) | Process images, audio, and video with AI models | `typescript` `multimodal` `ai` |
| [fine-tune-pipeline](templates/fine-tune-pipeline/) | LLM fine-tuning pipeline with dataset preparation and training | `typescript` `fine-tuning` `llm` |
| [data-pipeline](templates/data-pipeline/) | Data ingestion and transformation pipeline | `typescript` `data` `pipeline` |
| [agent-orchestrator](templates/agent-orchestrator/) | Multi-agent orchestration with delegation and coordination | `typescript` `agents` `orchestrator` |
| [ci-eval](templates/ci-eval/) | CI-integrated LLM evaluation with GitHub Actions | `typescript` `eval` `ci` |

### Applications

| Template | Description | Tags |
|---|---|---|
| [go-cli](templates/go-cli/) | Cobra CLI with Viper config, slog logging, GoReleaser release workflow | `go` `cli` `cobra` |
| [ts-service](templates/ts-service/) | Hono HTTP service with database drivers, JWT auth, and OpenTelemetry | `typescript` `hono` `api` |
| [go-service](templates/go-service/) | Go HTTP service with chi router, repository pattern, and OpenTelemetry | `go` `chi` `api` |
| [chrome-ext](templates/chrome-ext/) | Chrome extension (Manifest V3) with React sidepanel for AI interactions | `chrome-extension` `react` `vite` |
| [vscode-ext](templates/vscode-ext/) | VS Code extension with optional React webview and AI provider integration | `vscode` `extension` `typescript` |
| [next-app](templates/next-app/) | Next.js 15 App Router with streaming AI chat, Tailwind, auth, and database | `typescript` `nextjs` `react` |
| [slack-bot](templates/slack-bot/) | Slack bot with event handling and slash commands | `typescript` `slack` `bot` |
| [discord-bot](templates/discord-bot/) | Discord bot with command registration and event handling | `typescript` `discord` `bot` |
| [electron-app](templates/electron-app/) | Electron desktop application with IPC and auto-updates | `typescript` `electron` `desktop` |
| [api-gateway](templates/api-gateway/) | API gateway with routing, rate limiting, and upstream management | `typescript` `gateway` `api` |
| [worker-service](templates/worker-service/) | Background worker service with job processing | `typescript` `worker` `jobs` |
| [spring-boot-service](templates/spring-boot-service/) | Spring Boot 4 HTTP service on JDK 25 with Spring Data JPA, Flyway, Micrometer + OTel, structured logging | `java` `spring-boot` `api` |

### Infrastructure

| Template | Description | Tags |
|---|---|---|
| [infra-aws](templates/infra-aws/) | AWS CDK with Lambda/ECS, VPC, RDS, and CloudWatch monitoring | `aws` `cdk` `infrastructure` |
| [infra-fly](templates/infra-fly/) | Fly.io deployment with Dockerfile, fly.toml, and CI/CD | `fly` `deployment` `docker` |
| [infra-gcp](templates/infra-gcp/) | GCP Cloud Run with Cloud SQL, monitoring, and GitHub Actions | `gcp` `cloud-run` `infrastructure` |
| [infra-vercel](templates/infra-vercel/) | Vercel deployment with edge functions and CI/CD | `vercel` `deployment` `edge` |
| [infra-druid](templates/infra-druid/) | Apache Druid cluster with ingestion and query configuration | `druid` `analytics` `infrastructure` |
| [infra-cloudflare](templates/infra-cloudflare/) | Cloudflare Workers with KV, D1, and R2 | `cloudflare` `workers` `infrastructure` |
| [k8s-deploy](templates/k8s-deploy/) | Kubernetes manifests and Helm chart with Ingress, HPA, and CI/CD | `kubernetes` `helm` `deployment` |
| [istio-policy](templates/istio-policy/) | Istio policy bundle — AuthorizationPolicy, RequestAuthentication, JWT issuer + JWKs wiring | `istio` `service-mesh` `auth` |
| [monorepo](templates/monorepo/) | Turborepo/pnpm workspace with shared packages and CI | `monorepo` `turborepo` `pnpm` |
| [monitoring-stack](templates/monitoring-stack/) | Observability infrastructure with metrics, logs, and traces | `monitoring` `observability` `infrastructure` |

### Composable Modules

| Template | Description | Tags |
|---|---|---|
| [module-auth-ts](templates/module-auth-ts/) | Authentication middleware with pluggable providers (JWT, Clerk, Auth0, Supabase, API key) | `auth` `middleware` `jwt` |
| [module-auth-go](templates/module-auth-go/) | Go HTTP auth middleware with pluggable providers (JWT/JWKS, Auth0, Clerk, Supabase, API key) | `auth` `go` `middleware` |
| [module-database-ts](templates/module-database-ts/) | Drizzle ORM with pluggable drivers (PostgreSQL, SQLite, Turso) | `database` `drizzle` `orm` |
| [module-observability-ts](templates/module-observability-ts/) | OpenTelemetry instrumentation with pluggable exporters (console, OTLP, Datadog) | `observability` `opentelemetry` `tracing` |
| [module-storage-ts](templates/module-storage-ts/) | Blob storage abstraction with pluggable backends (local, S3, R2, GCS) | `storage` `s3` `blob` |
| [module-queue-ts](templates/module-queue-ts/) | Background job processing with pluggable brokers (in-memory, BullMQ, SQS) | `queue` `jobs` `workers` |
| [module-cache-ts](templates/module-cache-ts/) | Caching layer with pluggable backends (memory, Redis) | `cache` `redis` `performance` |
| [module-rate-limit-ts](templates/module-rate-limit-ts/) | Rate limiting with pluggable algorithms (token bucket, sliding window) | `rate-limit` `throttle` `middleware` |
| [module-webhook-ts](templates/module-webhook-ts/) | Webhook ingestion and delivery with signature verification | `webhook` `events` `middleware` |
| [module-notifications-ts](templates/module-notifications-ts/) | Multi-channel notifications (email, SMS, push) | `notifications` `email` `messaging` |
| [module-oauth-delegation-ts](templates/module-oauth-delegation-ts/) | Outbound OAuth 2.0 with PKCE, HMAC-signed state cookies, per-user token storage, refresh-before-expiry | `oauth` `delegation` `pkce` |
| [module-search-ts](templates/module-search-ts/) | Full-text search with pluggable backends (Algolia, Typesense, Meilisearch) | `search` `full-text` `algolia` |
| [module-knowledge-base-ts](templates/module-knowledge-base-ts/) | Knowledge base providers (Notion, Confluence, Google Docs, Coda) normalized to markdown | `knowledge-base` `notion` `confluence` |
| [module-project-mgmt-ts](templates/module-project-mgmt-ts/) | Project management providers (Linear, Jira, Asana, Shortcut) | `linear` `jira` `pm` |
| [module-analytics-ts](templates/module-analytics-ts/) | Product analytics with pluggable backends (Segment, PostHog, Mixpanel, Amplitude) | `analytics` `events` `posthog` |
| [module-media-ts](templates/module-media-ts/) | Media processing and delivery (Cloudinary, Uploadcare, imgix) | `media` `images` `cdn` |
| [module-llm-gateway](templates/module-llm-gateway/) | LLM provider gateway with routing and fallback | `llm` `gateway` `ai` |
| [module-llm-providers](templates/module-llm-providers/) | Shared LLM provider pack (Anthropic, OpenAI, Groq core; Bedrock/Azure/Vertex/HF/Ollama optional) | `llm` `providers` `ai` |
| [module-vector-store](templates/module-vector-store/) | Vector store abstraction with pluggable backends | `vectors` `embeddings` `ai` |
| [module-semantic-cache](templates/module-semantic-cache/) | Semantic caching for LLM responses using embeddings | `cache` `semantic` `ai` |
| [module-llm-observability](templates/module-llm-observability/) | LLM-specific observability with cost and latency tracking | `observability` `llm` `cost` |
| [module-billing-ts](templates/module-billing-ts/) | Usage-based billing and subscription management | `billing` `payments` `saas` |
| [module-feature-flags-ts](templates/module-feature-flags-ts/) | Feature flag management with evaluation rules | `feature-flags` `toggles` `configuration` |
| [module-spring-security](templates/module-spring-security/) | Drop-in Spring Security module — OIDC JWT resource server, header API keys, multi-provider filter chain | `java` `spring-security` `oidc` |

### Cross-Functional Templates

Beyond engineering, the catalog ships templates and agent briefs for design, QA, product, marketing, sales, operations, and customer success. Examples: `prd-template`, `test-plan`, `design-system`, `brand-guidelines`, `runbook`, `incident-postmortem`, `onboarding-playbook`, `proposal-template`. Agent briefs (`brief-*`) scaffold structured instruction documents instead of static files — one per non-engineering persona.

See [the catalog reference](docs/catalog.md) for the decision matrix and the full per-persona breakdown.

## How It Works

Every template lives in `templates/<name>/` and contains:

- **`template.yaml`** — declares metadata, variables, conditionals, and hooks per the [template contract spec](docs/spec/template-contract.md)
- **`skeleton/`** — the file tree to scaffold, with placeholder strings for variable interpolation
- **`README.md`** — when and why to reach for this template

Scaffolding tools read `template.yaml`, collect variable values from the user, and render `skeleton/` with those values substituted for their declared placeholders. The contract is generic — no tool-specific coupling.

## Composites

Pre-configured multi-template stacks in `composites/`:

| Composite | Use case |
|---|---|
| [proof-of-concept](composites/proof-of-concept.yaml) | Minimal AI agent + evals — fastest path to a working prototype |
| [ai-chatbot](composites/ai-chatbot.yaml) | Customer-facing chatbot with agent, service, auth, and deployment |
| [document-intelligence](composites/document-intelligence.yaml) | Document search and Q&A with RAG, storage, and database |
| [rag-agent](composites/rag-agent.yaml) | AI agent using RAG as a knowledge tool |
| [safe-ai-agent](composites/safe-ai-agent.yaml) | Agent with guardrails, evals, and prompt management |
| [multi-agent](composites/multi-agent.yaml) | A2A protocol peers with MCP tools, guardrails, and orchestration |
| [ai-web-app](composites/ai-web-app.yaml) | Full-stack Next.js app with RAG, auth, database, and observability |
| [mcp-toolkit](composites/mcp-toolkit.yaml) | MCP server with prompts and evals |
| [chrome-ai-extension](composites/chrome-ai-extension.yaml) | Chrome extension backed by MCP tools |
| [vscode-ai-extension](composites/vscode-ai-extension.yaml) | VS Code extension with AI, MCP, and prompts |
| [production-api](composites/production-api.yaml) | Full-stack API with auth, database, cache, rate limiting, queue, observability |
| [go-microservice](composites/go-microservice.yaml) | Go service with evals and Fly.io deployment |
| [background-processor](composites/background-processor.yaml) | Async job processing with queue, storage, and database |
| [internal-tool](composites/internal-tool.yaml) | CLI or browser extension with MCP tools |
| [enterprise-ai](composites/enterprise-ai.yaml) | Full enterprise stack — agents, RAG, guardrails, evals, K8s |
| [eval-suite](composites/eval-suite.yaml) | Standalone eval infrastructure with prompts and safety testing |
| [cost-optimized-ai](composites/cost-optimized-ai.yaml) | LLM gateway with cost-aware routing, semantic caching, and cost tracking |
| [ai-platform](composites/ai-platform.yaml) | Full AI platform with service, gateway, vectors, pipeline, auth, billing, monitoring |
| [agent-team](composites/agent-team.yaml) | Multi-agent system with orchestrator, specialized agents, evals, and MCP tools |
| [spring-boot-microservice](composites/spring-boot-microservice.yaml) | Spring Boot 4 service on JDK 25 with K8s deploy and optional Grafana + Prometheus + Loki |
| [identity-aware-service](composites/identity-aware-service.yaml) | Spring Boot 4 service with Istio mesh-edge auth plus Spring Security resource server (defense in depth) |
| [client-engagement](composites/client-engagement.yaml) | Proposal, battle cards, brand guidelines, campaign brief, onboarding playbook (non-engineering) |
| [product-launch](composites/product-launch.yaml) | Cross-functional launch spanning eng through marketing — Next.js app, design system, PRD, campaign, runbook |
| [research-to-prototype](composites/research-to-prototype.yaml) | PRD + agentic-loop prototype + optional test plan — idea to validated POC |

Composites define which templates to scaffold, where to nest them, and how variables flow across templates. See the [composite contract](docs/spec/composite-contract.md) for the specification.

## SDK

`@nanohype/sdk` is the reference implementation of the template rendering contract. Install it as a dependency to build your own scaffolding tool, CLI, MCP server, or CI pipeline on top of nanohype templates.

```ts
import { LocalSource, renderTemplate } from '@nanohype/sdk';

const source = new LocalSource({ rootDir: './nanohype' });
const { manifest, files } = await source.fetchTemplate('agentic-loop');
const result = renderTemplate(manifest, files, { ProjectName: 'my-agent' });
// result.files — rendered SkeletonFile[] ready to write to disk
```

The SDK lives at `sdk/` in this repo. See the [Consumer Implementation Guide](docs/spec/consumer-guide.md) for the full scaffolding algorithm.

## Docs

- [Consumer Implementation Guide](docs/spec/consumer-guide.md) — scaffolding algorithm, composite orchestration, catalog integration
- [Catalog Reference](docs/catalog.md) — decision matrix, composition map, and template selection guide
- [Template Contract](docs/spec/template-contract.md) — the formal schema for `template.yaml`
- [Composite Contract](docs/spec/composite-contract.md) — multi-template stack manifests
- [Authoring Guide](docs/authoring-guide.md) — practical walkthrough for creating new templates
- [Contributing](CONTRIBUTING.md) — how to add a template to the catalog

### Reference Architectures

- [Agentic Systems](docs/reference-architectures/agentic-systems.md)
- [RAG Pipelines](docs/reference-architectures/rag-pipelines.md)
- [MCP Ecosystem](docs/reference-architectures/mcp-ecosystem.md)

### Diagrams

- [Template Lifecycle](docs/diagrams/svg/template-lifecycle.svg)
- [Agentic Loop](docs/diagrams/svg/agentic-loop.svg)
- [MCP Topology](docs/diagrams/svg/mcp-topology.svg)
- [RAG Pipeline](docs/diagrams/svg/rag-pipeline.svg)

## Validation

```bash
npm install
npm run validate:schema
```

Or validate a single template:

```bash
./scripts/validate.sh templates/go-cli
```

## License

[Apache 2.0](LICENSE)
