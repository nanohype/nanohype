# llm-wiki

Multi-tenant LLM-maintained knowledge base. Agents incrementally build structured markdown wikis from raw sources — knowledge compounds over time rather than being re-derived per query.

## What you get

- Three-layer architecture: immutable raw sources, LLM-maintained wiki pages, configurable wiki schema
- Three core operations: ingest (source → wiki pages), query (search → synthesize → cite), lint (consistency health checks)
- Pluggable provider registries for storage (git, mock), source ingestion (local filesystem, mock), and LLM (`gateway`, which calls the Platform's ModelGateway and holds no model credential; mock)
- Multi-tenancy with tenant-isolated wikis, schemas, and role-based access control
- Git-backed wiki storage with commit-per-operation audit trail
- Wiki schema system defining page types, required sections, contradiction policy, and LLM configuration
- Cross-reference tracking via `[[wiki-link]]` syntax with orphan and broken link detection
- Operation queue preventing concurrent write mutations within a tenant
- HTTP API (Hono) for tenant management, source ingestion, wiki queries, and lint
- CLI for all operations: tenant management, ingest, query, lint, schema validation
- Token-based search with stop-word filtering and relevance scoring
- Discovery pages: queries can file structural insights back into the wiki
- Eval suite over a fixture wiki: golden cases for the answer a query exists to give, adversarial cases for page content and questions trying to redirect it — the corpus loader refuses an empty corpus rather than reporting a pass over one

## Variables

| Variable          | Type   | Default                                        | Description                                                             |
| ----------------- | ------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `ProjectName`     | string | _(required)_                                   | Kebab-case project name                                                 |
| `Description`     | string | `"Multi-tenant LLM-maintained knowledge base"` | Short description                                                       |
| `StorageProvider` | string | `"git"`                                        | Default wiki storage backend                                            |
| `LlmProvider`     | string | `"gateway"`                                    | Default LLM provider                                                    |
| `PlatformName`    | string | `${ProjectName}`                               | Platform CR the wiki deploys under; sets the gateway's default endpoint |
| `SourceProvider`  | string | `"local"`                                      | Default source ingestion provider                                       |
| `IncludeApi`      | bool   | `true`                                         | Include HTTP API server                                                 |
| `IncludeCli`      | bool   | `true`                                         | Include CLI interface                                                   |
| `IncludeTests`    | bool   | `true`                                         | Include test suite                                                      |

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
      gateway.ts                # Platform ModelGateway, no credential
      mock.ts                   # deterministic responses for testing
    operations/
      types.ts                  # IngestResult, QueryResult, LintResult
      queue.ts                  # per-tenant write lock
      ingest.ts                 # source → LLM → wiki pages
      query.ts                  # search → synthesize → cite
      lint.ts                   # consistency health checks
    eval/
      cases.ts                  # corpus loader; refuses an empty or malformed corpus
      fixture-storage.ts        # storage provider backed by the fixture pages
      runner.ts                 # asks every case of the fixture wiki
      cases/                    # one golden or adversarial case per file
      fixtures/                 # the wiki pages the cases are answered from
    api/                        # (conditional: IncludeApi)
      server.ts                 # Hono HTTP server
      routes/                   # tenant, source, wiki, admin routes
      middleware/auth.ts        # API key auth
    cli/                        # (conditional: IncludeCli)
      index.ts                  # Commander entry point
      commands/                 # tenant, ingest, query, lint, schema
    __tests__/                  # (conditional: IncludeTests)
      eval-cases.test.ts
      ingest.test.ts
      query.test.ts
      lint.test.ts
      tenant.test.ts
      link-graph.test.ts
      registry.test.ts
```

## Configuration

The project reads these settings from the process environment and loads no `.env` file. `src/config.ts` declares them.

- `WIKI_DATA_DIR` -- directory that holds the tenant registry and each tenant's wiki. Defaults to `./data`.
- `WIKI_STORAGE_PROVIDER` -- storage provider ingest, query and lint use. Defaults to the `StorageProvider` value.
- `WIKI_SOURCE_PROVIDER` -- source provider ingest reads from. Defaults to the `SourceProvider` value.
- `WIKI_LLM_PROVIDER` -- LLM provider ingest and query call. Defaults to the `LlmProvider` value.
- `MODEL_GATEWAY_ENDPOINT` -- root of the Platform's ModelGateway, as ModelGateway `status.endpoint` publishes it, which the `gateway` provider calls. Defaults to the Service the eks-agent-platform operator creates for the Platform named by `PlatformName`. A value with a path, query or fragment fails the gateway provider's import. The gateway runs under the tenant's EKS Pod Identity and holds the Bedrock role, so the wiki holds no model credential and sends none. Off the cluster, forward the gateway Service (`kubectl -n tenants-<PlatformName> port-forward svc/<PlatformName>-gateway 8080:8080`, which the Kubernetes API server authorizes as the user who opens it, with `create` on `pods/portforward` in that namespace) and set this to `http://localhost:8080`.
- `MODEL_ROUTE` -- ModelGateway route the `gateway` provider names when a call sets no model. Defaults to `default`.
- `LLM_REQUEST_TIMEOUT_MS` -- how long an LLM provider waits on a model call, in milliseconds: a whole number from 1 to 2147483647, and 120000 when unset or empty. A call has to finish its whole reply within it, and the default covers the gateway provider's 4096-token reply at about 34 tokens a second, so a caller that raises `maxTokens` raises the timeout with it. The `gateway` provider gives up on the call at one timeout. Any other value fails the first operation that loads the configuration.
- `WIKI_API_KEY` -- bearer token the HTTP API requires. When it is unset, the API serves every request unauthenticated and warns that it does.

## After scaffolding

```bash
# Start the API server
npm run dev

# Or use the CLI
npm run cli -- tenant create my-project --name "My Project" --schema src/schema/default-schema.yaml
npm run cli -- ingest my-project ./docs/architecture.md
npm run cli -- query my-project "How does authentication work?"
npm run cli -- lint my-project

# Ask the eval cases of the fixture wiki. This reaches the configured model,
# so it runs on demand rather than in CI.
npm run eval
```

## Pairs with

- [agentic-loop](../agentic-loop/) — agents can call ingest/query/lint as tool actions
- [rag-pipeline](../rag-pipeline/) — wiki pages become high-quality retrieval targets
- [module-llm-gateway](../module-llm-gateway/) — route LLM calls through the gateway
- [eval-harness](../eval-harness/) — evaluate wiki quality and completeness

## Nests inside

- [monorepo](../monorepo/)
