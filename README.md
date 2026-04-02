# nanohype

A tool-agnostic template catalog for AI-focused projects. Each template is a self-contained, scaffoldable starting point — consumable by any scaffolding tool that reads the [template contract](docs/spec/template-contract.md).

## Templates

### AI Systems

| Template | Description | Tags |
|---|---|---|
| [agentic-loop](templates/agentic-loop/) | Autonomous agent with tool registry, memory, provider abstraction, eval harness | `typescript` `agent` `llm` |
| [rag-pipeline](templates/rag-pipeline/) | TypeScript RAG pipeline with chunking, embedding, vector store, retrieval, generation | `typescript` `rag` `embeddings` |
| [mcp-server-ts](templates/mcp-server-ts/) | TypeScript MCP server with tool/resource registration and Zod validation | `mcp` `typescript` `tools` |
| [eval-harness](templates/eval-harness/) | Standalone LLM evaluation framework with YAML suites, assertions, and reporters | `typescript` `eval` `testing` |
| [prompt-library](templates/prompt-library/) | Versioned prompt management with YAML frontmatter and optional TypeScript SDK | `prompts` `yaml` `versioning` |

### Applications

| Template | Description | Tags |
|---|---|---|
| [go-cli](templates/go-cli/) | Cobra CLI with Viper config, slog logging, GoReleaser release workflow | `go` `cli` `cobra` |
| [ts-service](templates/ts-service/) | Hono HTTP service with database drivers, JWT auth, and OpenTelemetry | `typescript` `hono` `api` |
| [go-service](templates/go-service/) | Go HTTP service with chi router, repository pattern, and OpenTelemetry | `go` `chi` `api` |
| [chrome-ext](templates/chrome-ext/) | Chrome extension (Manifest V3) with React sidepanel for AI interactions | `chrome-extension` `react` `vite` |
| [vscode-ext](templates/vscode-ext/) | VS Code extension with optional React webview and AI provider integration | `vscode` `extension` `typescript` |

### Infrastructure

| Template | Description | Tags |
|---|---|---|
| [infra-aws](templates/infra-aws/) | AWS CDK with Lambda/ECS, VPC, RDS, and CloudWatch monitoring | `aws` `cdk` `infrastructure` |
| [infra-fly](templates/infra-fly/) | Fly.io deployment with Dockerfile, fly.toml, and CI/CD | `fly` `deployment` `docker` |
| [monorepo](templates/monorepo/) | Turborepo/pnpm workspace with shared packages and CI | `monorepo` `turborepo` `pnpm` |

### Composable Modules

| Template | Description | Tags |
|---|---|---|
| [module-auth](templates/module-auth/) | Authentication middleware with pluggable providers (JWT, Clerk, Auth0, Supabase, API key) | `auth` `middleware` `jwt` |
| [module-database](templates/module-database/) | Drizzle ORM with pluggable drivers (PostgreSQL, SQLite, Turso) | `database` `drizzle` `orm` |
| [module-observability](templates/module-observability/) | OpenTelemetry instrumentation with pluggable exporters (console, OTLP, Datadog) | `observability` `opentelemetry` `tracing` |
| [module-storage](templates/module-storage/) | Blob storage abstraction with pluggable backends (local, S3, R2, GCS) | `storage` `s3` `blob` |
| [module-queue](templates/module-queue/) | Background job processing with pluggable brokers (in-memory, BullMQ, SQS) | `queue` `jobs` `workers` |

## How It Works

Every template lives in `templates/<name>/` and contains:

- **`template.yaml`** — declares metadata, variables, conditionals, and hooks per the [template contract spec](docs/spec/template-contract.md)
- **`skeleton/`** — the file tree to scaffold, with placeholder strings for variable interpolation
- **`README.md`** — when and why to reach for this template

Scaffolding tools read `template.yaml`, collect variable values from the user, and render `skeleton/` with those values substituted for their declared placeholders. The contract is generic — no tool-specific coupling.

## Docs

- [Catalog Reference](docs/catalog.md) — decision matrix, composition map, and template selection guide
- [Template Contract Specification](docs/spec/template-contract.md) — the formal schema for `template.yaml`
- [Template Authoring Guide](docs/authoring-guide.md) — practical walkthrough for creating new templates
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
