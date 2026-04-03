# module-knowledge-base

Knowledge base integration with pluggable providers.

## What you get

- Factory-based provider registry with circuit breakers per instance
- Notion provider (API v1, bearer token, block-to-markdown conversion)
- Confluence provider (REST API, basic auth, storage format to markdown)
- Google Docs provider (Docs API, OAuth2 bearer, doc JSON to markdown)
- Coda provider (API v1, bearer token, docs/tables to markdown)
- In-memory mock provider for testing with full CRUD and search
- All providers normalize content to markdown (`Page.content` is always markdown)
- Data-pipeline IngestSource adapter for bridging pages into document pipelines
- OTel metrics for request tracking and latency
- Native fetch throughout -- no provider-specific SDKs

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Knowledge base integration with pluggable providers` | Project description |
| `Provider` | string | `notion` | Default provider (notion/confluence/google-docs/coda/mock or custom) |

## Project layout

```text
<ProjectName>/
  src/
    knowledge-base/
      index.ts              # createKnowledgeClient(config) facade
      types.ts              # Page, Block, PageCreate, PageUpdate, SearchOptions, ListOptions, PaginatedResult
      config.ts             # Zod-validated configuration
      bootstrap.ts          # Unresolved placeholder guard
      logger.ts             # Structured JSON logger
      metrics.ts            # OTel: knowledge_base_request_total, duration_ms
      providers/
        types.ts            # KnowledgeProvider interface + factory type
        registry.ts         # Factory-based provider registry
        notion.ts           # Notion API v1 provider
        confluence.ts       # Confluence REST API provider
        google-docs.ts      # Google Docs API provider
        coda.ts             # Coda API provider
        mock.ts             # In-memory provider for testing
        index.ts            # Barrel import -- triggers self-registration
      ingest/
        adapter.ts          # IngestSource adapter for data-pipeline
      resilience/
        circuit-breaker.ts  # Lightweight circuit breaker state machine
      __tests__/
        registry.test.ts    # Factory-based registry tests
        mock.test.ts        # CRUD, search, markdown content tests
        adapter.test.ts     # IngestSource adapter tests
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add knowledge base access to a service
- [rag-pipeline](../rag-pipeline/) -- feed knowledge base pages into RAG
- [data-pipeline](../data-pipeline/) -- use the IngestSource adapter
- [agentic-loop](../agentic-loop/) -- give agents access to knowledge bases

## Nests inside

- [monorepo](../monorepo/)
