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

### Applications

**go-cli** — Reach for this when the deliverable is a command-line tool. Developer utilities, platform CLIs, automation scripts. Go compiles to a single binary — no runtime dependencies for the end user.

**ts-service** — Reach for this when the client needs an HTTP API. The general-purpose backend: routes, middleware, database, auth, observability. Hono framework, Drizzle ORM, OpenTelemetry. The most commonly scaffolded application template.

**go-service** — Reach for this when the client's team is Go-native or performance requirements demand it. Same architecture as ts-service (routes, middleware, repository pattern) but in Go with chi router and pgx.

**chrome-ext** — Reach for this when the client wants AI in the browser: page analysis, text selection, sidepanel chat. Manifest V3, React, Vite build, AI provider registry.

**vscode-ext** — Reach for this when the client wants AI in the editor: code analysis, inline suggestions, webview panels. esbuild for fast bundling, optional React webview, AI provider registry.

### Infrastructure

**infra-aws** — Reach for this when deploying to AWS. CDK constructs for Lambda or ECS, API Gateway or ALB, optional VPC, RDS, CloudWatch. The enterprise deploy target.

**infra-fly** — Reach for this when deploying to Fly.io. Simpler than AWS, faster to set up, good for services that don't need the full AWS ecosystem. Dockerfile + fly.toml + deploy script.

**monorepo** — Reach for this when a client engagement involves 3+ templates. Turborepo workspace with shared TypeScript config, ESLint, and Prettier. Everything else nests inside.

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
