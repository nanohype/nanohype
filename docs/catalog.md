# Template Catalog Reference

A decision guide for selecting and composing templates. Read this to understand which templates to reach for given a client problem, how they compose, and when to layer in modules.

---

## Decision Matrix

### By client problem

| Client says... | Start with | Layer in | Deploy with |
|---|---|---|---|
| "We need an AI chatbot" | agentic-loop | module-auth, module-database | ts-service + infra-fly |
| "Search our internal docs" | rag-pipeline | module-storage, module-database | ts-service + infra-aws |
| "Build us an MCP server" | mcp-server-ts | eval-harness | infra-fly |
| "CLI tool for our platform" | go-cli | eval-harness | infra-fly |
| "Chrome extension with AI" | chrome-ext | mcp-server-ts | — |
| "VS Code extension" | vscode-ext | mcp-server-ts, prompt-library | — |
| "Full-stack AI web app" | next-app | module-auth, module-database, rag-pipeline | infra-vercel |
| "API service (TypeScript)" | ts-service | module-auth, module-database, module-observability | infra-aws or infra-fly |
| "API service (Go)" | go-service | — (auth + db built in) | infra-aws or infra-fly |
| "We need background processing" | ts-service | module-queue, module-database | infra-aws |
| "Evaluate our LLM outputs" | eval-harness | prompt-library | — |
| "Manage our prompts" | prompt-library | eval-harness | — |
| "Multi-agent system" | a2a-agent | agentic-loop, mcp-server-ts | ts-service + infra-aws |
| "AI safety / content filtering" | guardrails | agentic-loop or ts-service | — |
| "Process images/audio/video" | multimodal-pipeline | module-storage, rag-pipeline | ts-service + infra-aws |
| "Deploy to AWS" | infra-aws | — | — |
| "Deploy to Fly.io" | infra-fly | — | — |
| "Deploy to GCP" | infra-gcp | — | — |
| "Deploy to Vercel" | infra-vercel | — | — |
| "Kubernetes deployment" | k8s-deploy | — | — |
| "Monorepo for everything" | monorepo | (all others nest inside) | — |

### By engagement type

| Engagement | Typical stack | Timeline signal |
|---|---|---|
| **Proof of concept** | agentic-loop + eval-harness | Days |
| **Internal tool** | go-cli or chrome-ext + mcp-server-ts | 1-2 weeks |
| **Customer-facing chatbot** | agentic-loop + ts-service + module-auth + module-database + infra-fly | 2-4 weeks |
| **Document intelligence** | rag-pipeline + ts-service + module-storage + infra-aws | 2-4 weeks |
| **Platform with AI features** | next-app + rag-pipeline + module-auth + module-database + module-queue + infra-aws | 4-8 weeks |
| **Enterprise AI infrastructure** | monorepo + agentic-loop + mcp-server-ts + guardrails + eval-harness + k8s-deploy | 8+ weeks |
| **Developer tooling** | vscode-ext or chrome-ext + mcp-server-ts + prompt-library | 2-4 weeks |

### By technical requirement

| Requirement | Template | Why |
|---|---|---|
| Streaming responses | agentic-loop, ts-service, next-app | Built-in streaming support |
| Tool calling | agentic-loop, mcp-server-ts | Tool registry pattern |
| Vector search | rag-pipeline | Full retrieval pipeline with vector store registry |
| Multi-model support | Any with LlmProvider | Provider registry — swap models at config level |
| Offline/local models | rag-pipeline (embedding), agentic-loop | Local provider stubs in registry |
| Real-time updates | module-queue + ts-service | Job processing with webhook delivery |
| File handling | module-storage | S3/R2/GCS/local abstraction |
| Auth required | module-auth + ts-service | JWT/Clerk/Auth0/Supabase/API key |
| Background jobs | module-queue | BullMQ/SQS/in-memory |
| Caching layer | module-cache | Redis/Valkey/in-memory |
| Rate limiting | module-rate-limit | Token bucket/sliding window |
| Observability | module-observability | OpenTelemetry traces + metrics |
| Database | module-database | Drizzle ORM with Postgres/SQLite/Turso |
| Content safety | guardrails | Input/output filtering pipeline |
| Multi-agent coordination | a2a-agent | Agent-to-Agent protocol |
| CI/CD | infra-fly, infra-aws, k8s-deploy | GitHub Actions workflows included |

---

## Composition Map

### How templates relate

```text
┌─────────────────────────────────────────────────────────────┐
│                        monorepo                             │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  AI Systems  │  │ Applications │  │  Infrastructure   │  │
│  │              │  │              │  │                    │  │
│  │ agentic-loop │  │ ts-service   │  │ infra-aws         │  │
│  │ rag-pipeline │  │ go-service   │  │ infra-fly         │  │
│  │ mcp-server   │  │ go-cli       │  │ infra-gcp         │  │
│  │ eval-harness │  │ chrome-ext   │  │ infra-vercel      │  │
│  │ prompt-lib   │  │ vscode-ext   │  │ k8s-deploy        │  │
│  │ a2a-agent    │  │ next-app     │  │                    │  │
│  │ guardrails   │  │ slack-bot    │  │                    │  │
│  │ multimodal   │  │ discord-bot  │  │                    │  │
│  │ fine-tune    │  │ electron-app │  │                    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                 │                    │              │
│         └────────┬────────┘                    │              │
│                  │                             │              │
│         ┌────────▼─────────┐                   │              │
│         │ Composable       │                   │              │
│         │ Modules          ├───────────────────┘              │
│         │                  │                                  │
│         │ module-auth      │  Modules plug into               │
│         │ module-database  │  applications and                │
│         │ module-observ.   │  AI systems.                     │
│         │ module-storage   │                                  │
│         │ module-queue     │  Infrastructure                  │
│         │ module-cache     │  deploys the result.             │
│         │ module-rate-lim. │                                  │
│         │ module-webhook   │                                  │
│         │ module-notif.    │                                  │
│         └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### Composition rules

1. **AI systems + applications** — AI systems provide the intelligence, applications provide the interface. An agentic-loop needs a ts-service or next-app to expose it to users.
2. **Modules plug into applications** — Modules are never standalone. They add capabilities (auth, database, caching) to a service or AI system.
3. **Infrastructure deploys everything** — Pick one deploy target per project. infra-aws for production, infra-fly for speed, infra-vercel for frontend-heavy.
4. **monorepo wraps multi-template projects** — When scaffolding 3+ templates for one client, start with monorepo and nest the others inside.
5. **eval-harness pairs with everything** — Every AI system should have evals. Scaffold eval-harness alongside any AI template.

---

## Template Profiles

### AI Systems

**agentic-loop** — Reach for this when the client needs autonomous AI behavior: an agent that reasons, calls tools, and iterates until it solves the problem. The core pattern for chatbots, copilots, and automated workflows. Pairs with mcp-server-ts for tools and eval-harness for testing.

**rag-pipeline** — Reach for this when the client has documents, data, or knowledge they want to query with natural language. Ingestion, chunking, embedding, vector search, and generation with citations. The go-to for "search our docs" and "answer questions from our data."

**mcp-server-ts** — Reach for this when the client needs to expose tools, data, or capabilities to AI systems via the Model Context Protocol. MCP servers are the standard integration point between LLMs and external systems.

**eval-harness** — Reach for this alongside any AI system. Defines test suites in YAML, runs them against the LLM, and reports pass/fail with scores. Non-negotiable for production AI — catch regressions before they reach users.

**prompt-library** — Reach for this when prompts are a first-class asset: versioned, validated, and managed separately from code. The SDK loads and renders prompts at runtime. Useful when multiple systems share prompts or when prompt engineering is a distinct workflow.

**mcp-server-python** — Reach for this when the client's team is Python-native and needs an MCP server. Same architecture as mcp-server-ts but idiomatic Python with Pydantic validation, structlog logging, and FastAPI for the HTTP transport. Decorator-based tool registration.

**multimodal-pipeline** — Reach for this when the client needs to process images, audio, or video with AI. Detects modality, preprocesses (resize, transcode, frame extract), sends to vision/audio LLMs, returns structured output. Processor registry pattern — add custom modality handlers.

**data-pipeline** — Reach for this when you need ETL for AI workloads. Ingests documents from files or web pages, chunks with pluggable strategies (recursive, fixed-size, semantic), embeds via provider registry, and indexes to pluggable output adapters. Separates ingestion from query in RAG architectures. Output is compatible with module-vector-store.

**fine-tune-pipeline** — Reach for this when RAG and prompting aren't enough. Dataset preparation (JSONL formatting, validation, train/val/test splitting), training job submission via provider registry (OpenAI fine-tuning API), post-training eval comparing fine-tuned vs base model.

**agent-orchestrator** — Reach for this when one agent isn't enough. Coordinates multiple specialized agents with LLM-powered task decomposition, capability-based routing, shared context accumulation, and handoff audit trails. Sits above agentic-loop and a2a-agent.

**ci-eval** — Reach for this to gate deployments on eval scores. GitHub Actions workflow that runs eval-harness suites in CI, compares against stored baselines, posts results as PR comments, and fails the check if any suite regresses beyond a configurable threshold.

### Applications

**go-cli** — Reach for this when the deliverable is a command-line tool. Developer utilities, platform CLIs, automation scripts. Go compiles to a single binary — no runtime dependencies for the end user.

**ts-service** — Reach for this when the client needs an HTTP API. The general-purpose backend: routes, middleware, database, auth, observability. Hono framework, Drizzle ORM, OpenTelemetry. The most commonly scaffolded application template.

**go-service** — Reach for this when the client's team is Go-native or performance requirements demand it. Same architecture as ts-service (routes, middleware, repository pattern) but in Go with chi router and pgx.

**chrome-ext** — Reach for this when the client wants AI in the browser: page analysis, text selection, sidepanel chat. Manifest V3, React, Vite build, AI provider registry.

**vscode-ext** — Reach for this when the client wants AI in the editor: code analysis, inline suggestions, webview panels. esbuild for fast bundling, optional React webview, AI provider registry.

**slack-bot** — Reach for this when the client wants AI in Slack. @slack/bolt with Socket Mode (dev) and HTTP (prod). Message and @mention handlers with thread-aware conversation context. Slash commands for direct AI queries.

**discord-bot** — Reach for this when the client wants AI in Discord. discord.js v14 with slash commands, message handlers, and embed-formatted responses. Per-channel conversation context with typing indicators.

**electron-app** — Reach for this when the client needs a desktop app with AI. Electron main/renderer architecture with IPC bridge — API keys stay in the main process. React UI with armature design tokens. esbuild for main, Vite for renderer.

**api-gateway** — Reach for this when you need an edge layer in front of multiple backend services. Reverse proxy with per-route rate limiting, JWT/API key auth, request/response transformation, canary traffic splitting, and upstream health checking. Per-upstream circuit breakers.

**worker-service** — Reach for this when you need background processing. Combines scheduled cron jobs and queue consumption in a single deployable service. Lightweight cron parser (no external library), pluggable queue provider, health server on a separate port, graceful shutdown that drains both subsystems.

### Infrastructure

**infra-aws** — Reach for this when deploying to AWS. CDK constructs for Lambda or ECS, API Gateway or ALB, optional VPC, RDS, CloudWatch. The enterprise deploy target.

**infra-fly** — Reach for this when deploying to Fly.io. Simpler than AWS, faster to set up, good for services that don't need the full AWS ecosystem. Dockerfile + fly.toml + deploy script.

**infra-gcp** — Reach for this when deploying to GCP. Cloud Run service, Cloud SQL, monitoring dashboards. gcloud CLI deploy scripts with GitHub Actions CI.

**infra-vercel** — Reach for this when deploying to Vercel. vercel.json with framework presets, environment variable management, GitHub Actions for preview and production deploys.

**k8s-deploy** — Reach for this when deploying to Kubernetes. Helm chart with proper security hardening (non-root, read-only FS, resource limits), HPA, rolling updates, ingress with TLS. Raw manifests as alternative.

**monorepo** — Reach for this when a client engagement involves 3+ templates. Turborepo workspace with shared TypeScript config, ESLint, and Prettier. Everything else nests inside.

**infra-druid** — Reach for this when the client needs real-time analytics. Apache Druid OLAP cluster on Kubernetes with all six services (router, broker, coordinator, overlord, historical, task). Kubernetes-native discovery (no ZooKeeper), S3 deep storage, PostgreSQL metadata, optional mTLS and Prometheus monitoring.

**infra-cloudflare** — Reach for this when deploying to the edge. Cloudflare Workers with wrangler.toml, optional R2 object storage and D1 database bindings, GitHub Actions deploy workflow with staging preview on PR.

### Composable Modules

**module-auth** — Add this when the service needs authentication. Five built-in providers (JWT, Clerk, Auth0, Supabase, API key). Framework-agnostic middleware that works with both Hono and Express.

**module-database** — Add this when the service needs persistent storage. Drizzle ORM with PostgreSQL, SQLite, and Turso drivers. Schema definitions, migrations, and connection management.

**module-observability** — Add this when the service needs production monitoring. OpenTelemetry traces, metrics, and structured logging with pluggable exporters (console, OTLP, Datadog).

**module-storage** — Add this when the service needs file/blob storage. Upload, download, list, delete, and signed URLs with local, S3, R2, and GCS backends.

**module-queue** — Add this when the service needs background job processing. In-memory for dev, BullMQ for Redis-backed production, SQS for AWS-native. Priority, retries, delays, graceful shutdown.

**module-cache** — Add this when the service needs caching. In-memory for dev, Redis for distributed, Memcached for legacy. TTL, namespacing, and cache-aside (getOrSet) helper.

**module-rate-limit** — Add this when the service needs request throttling. Token bucket, sliding window, and fixed window algorithms with in-memory or Redis state stores. Ships with Hono and Express middleware factories.

**module-webhook** — Add this when the service sends or receives webhooks. Pluggable signature verification (HMAC-SHA256, HMAC-SHA1), sender with exponential backoff retry, and event logging for debugging.

**module-notifications** — Add this when the service sends user notifications. Email (Resend, SendGrid), optional SMS (Twilio), optional push (web-push). Template rendering with variable substitution and batch sending.

**module-llm-gateway** — Add this when the service calls multiple LLM providers. Unified routing with five pluggable strategies (static, round-robin, latency, cost, adaptive epsilon-greedy). Response caching (hash, sliding-TTL), token counting, per-request cost tracking with anomaly detection, and circuit breakers on every provider call.

**module-vector-store** — Add this when any service needs similarity search. Pluggable backends: in-memory for dev, pgvector for PostgreSQL, Qdrant and Pinecone for managed services. Provider-agnostic filter expressions compiled per backend. Batch upserts, cosine similarity, metadata filtering.

**module-semantic-cache** — Add this when LLM costs are high and prompts are repetitive. Embeds prompts into vectors and finds similar cached responses via cosine similarity. Configurable similarity threshold (default 0.95). Ships with a gateway adapter so it plugs directly into module-llm-gateway as a caching strategy.

**module-llm-observability** — Add this when you need to answer "how much is this costing us" and "is the AI getting worse." Wraps LLM calls to capture prompt, response, model, latency, and token usage as structured spans. Cost calculator with per-model pricing and anomaly detection. Quality monitor with rolling p50/p95 scores and regression alerts. Pluggable exporters (console, OTLP, JSON file).

**module-billing** — Add this when the service needs usage metering and payments. Tracks API calls, tokens, or custom metrics per customer. Generates invoices from aggregated usage with per-unit, tiered, and flat pricing. Stripe integration for payment collection and webhook lifecycle events. Mock provider for offline development.

**module-feature-flags** — Add this when the service needs to toggle AI behavior per user or cohort. Evaluate flags with percentage rollout (deterministic FNV-1a hashing), user allowlists, and property-based rules. Pluggable flag stores (memory, Redis, JSON file). Variant tracker for pairing with observability.

**module-llm-providers** — Add this as the canonical LLM integration layer. Unified interface across Anthropic, OpenAI, Groq (always included), plus Bedrock, Azure OpenAI, Vertex AI, Hugging Face, and Ollama (conditional). Token counting, pricing table, streaming normalization. Gateway adapter bridges to module-llm-gateway's interface.

**module-project-mgmt** — Add this when AI agents need to create and manage work items. Unified interface across Linear (GraphQL), Jira (REST), Asana, and Shortcut. Priority mapping, pagination abstraction, comment threading.

**module-knowledge-base** — Add this when pipelines need to ingest from or publish to where documentation lives. Unified interface across Notion, Confluence, Google Docs, and Coda. Content normalized to markdown. Ships with a data-pipeline IngestSource adapter for RAG ingestion from SaaS knowledge bases.

**module-search** — Add this when the service needs full-text search. Pluggable backends: Algolia, Typesense, Meilisearch. Hybrid search combiner merges keyword results with vector-store results via reciprocal rank fusion.

**module-analytics** — Add this when the service needs event tracking. Unified interface across Segment, PostHog, Mixpanel, Amplitude. Buffered batch sends, auto-tracking HTTP middleware for Hono and Express.

**module-media** — Add this when the service handles images or video. Upload, transform, and deliver through Cloudinary, Uploadcare, or imgix. Named transform presets (thumbnail, avatar, hero, og-image), fluent TransformBuilder API, responsive srcset generation.

### Infrastructure

**monitoring-stack** — Reach for this when a client needs observability but doesn't have an existing platform. Grafana for dashboards, Prometheus for metrics, Loki for logs. Docker Compose for local dev, Helm chart for Kubernetes. Pre-configured datasources, default service and system dashboards, and alert rules for error rate, latency, CPU, memory, and disk.

---

## Module Layering Guide

Modules are designed to compose. Here are common stacks:

### Minimal API

```text
ts-service
└── module-auth (if protected)
```

### Standard service

```text
ts-service
├── module-auth
├── module-database
└── module-observability
```

### Production service

```text
ts-service
├── module-auth
├── module-database
├── module-observability
├── module-cache
├── module-rate-limit
└── module-queue (if async work)
```

### AI-powered service

```text
ts-service
├── agentic-loop (or rag-pipeline)
├── module-auth
├── module-database
├── module-observability
├── module-storage (for document uploads)
└── eval-harness (for testing)
```

### Full platform

```text
monorepo
├── apps/
│   ├── api (ts-service + modules)
│   ├── web (next-app)
│   └── worker (ts-service + module-queue)
├── packages/
│   ├── ai (agentic-loop)
│   ├── evals (eval-harness)
│   └── shared-utils
└── infra/ (infra-aws or k8s-deploy)
```

---

## For the scaffolding tool

When selecting templates programmatically:

1. Start with the **primary template** based on the client's core need (decision matrix, column 2)
2. Add **modules** based on technical requirements (decision matrix, "Layer in" column)
3. Add **infrastructure** based on deploy target (decision matrix, "Deploy with" column)
4. If 3+ templates are selected, wrap in **monorepo**
5. Always add **eval-harness** alongside AI system templates
6. Check `composition.pairsWith` in each template.yaml for additional suggestions
