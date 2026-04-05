# llm-wiki

Multi-tenant LLM-maintained knowledge base. Agents incrementally build structured markdown wikis from raw sources — knowledge compounds over time rather than being re-derived per query.

## What you get

- Three-layer architecture: immutable raw sources, LLM-maintained wiki pages, configurable wiki schema
- Three core operations: ingest (source → wiki pages), query (search → synthesize → cite), lint (consistency health checks)
- Pluggable provider registries for storage (git, mock), source ingestion (local filesystem, mock), and LLM (Anthropic, mock)
- Multi-tenancy with tenant-isolated wikis, schemas, and role-based access control
- Git-backed wiki storage with commit-per-operation audit trail
- Wiki schema system defining page types, required sections, contradiction policy, and LLM configuration
- Cross-reference tracking via `[[wiki-link]]` syntax with orphan and broken link detection
- Operation queue preventing concurrent write mutations within a tenant
- HTTP API (Hono) for tenant management, source ingestion, wiki queries, and lint
- CLI for all operations: tenant management, ingest, query, lint, schema validation
- Token-based search with stop-word filtering and relevance scoring
- Discovery pages: queries can file structural insights back into the wiki

## Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ProjectName` | string | *(required)* | Kebab-case project name |
| `Description` | string | `"Multi-tenant LLM-maintained knowledge base"` | Short description |
| `StorageProvider` | string | `"git"` | Default wiki storage backend |
| `LlmProvider` | string | `"anthropic"` | Default LLM provider |
| `SourceProvider` | string | `"local"` | Default source ingestion provider |
| `IncludeApi` | bool | `true` | Include HTTP API server |
| `IncludeCli` | bool | `true` | Include CLI interface |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/
    index.ts                    # public API barrel
    config.ts                   # Zod-validated env config
    tenant/
      types.ts                  # Tenant, Role
      registry.ts               # tenant CRUD
      auth.ts                   # role-based access control
    schema/
      types.ts                  # WikiSchema, PageTypeDefinition
      parser.ts                 # YAML parsing with Zod validation
      default-schema.yaml       # starter schema (entity, concept, decision, timeline)
    wiki/
      types.ts                  # Page, PageMeta, CrossRef, Contradiction
      page.ts                   # markdown + YAML frontmatter CRUD
      index-manager.ts          # auto-maintained index.md
      link-graph.ts             # [[wiki-link]] extraction and graph analysis
      search.ts                 # token-based FTS with relevance scoring
    storage/
      types.ts                  # StorageProvider interface
      registry.ts               # factory-based provider registry
      git.ts                    # git-backed storage (default)
      mock.ts                   # in-memory for testing
    sources/
      types.ts                  # Source, SourceProvider interface
      registry.ts               # factory-based provider registry
      local.ts                  # filesystem source with SHA-256 hashing
      mock.ts                   # in-memory for testing
    llm/
      types.ts                  # LlmMessage, LlmProvider interface
      registry.ts               # factory-based provider registry
      anthropic.ts              # Claude API via @anthropic-ai/sdk
      mock.ts                   # deterministic responses for testing
    operations/
      types.ts                  # IngestResult, QueryResult, LintResult
      queue.ts                  # per-tenant write lock
      ingest.ts                 # source → LLM → wiki pages
      query.ts                  # search → synthesize → cite
      lint.ts                   # consistency health checks
    api/                        # (conditional: IncludeApi)
      server.ts                 # Hono HTTP server
      routes/                   # tenant, source, wiki, admin routes
      middleware/auth.ts        # API key auth
    cli/                        # (conditional: IncludeCli)
      index.ts                  # Commander entry point
      commands/                 # tenant, ingest, query, lint, schema
    __tests__/                  # (conditional: IncludeTests)
      ingest.test.ts
      query.test.ts
      lint.test.ts
      tenant.test.ts
      link-graph.test.ts
      registry.test.ts
```

## After scaffolding

```bash
# Start the API server
npm run dev

# Or use the CLI
npm run cli -- tenant create my-project --name "My Project" --schema src/schema/default-schema.yaml
npm run cli -- ingest my-project ./docs/architecture.md
npm run cli -- query my-project "How does authentication work?"
npm run cli -- lint my-project
```

## Pairs with

- [agentic-loop](../agentic-loop/) — agents can call ingest/query/lint as tool actions
- [rag-pipeline](../rag-pipeline/) — wiki pages become high-quality retrieval targets
- [module-llm-gateway](../module-llm-gateway/) — route LLM calls through the gateway
- [eval-harness](../eval-harness/) — evaluate wiki quality and completeness

## Nests inside

- [monorepo](../monorepo/)
