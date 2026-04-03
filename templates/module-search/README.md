# module-search

Full-text search with pluggable backends.

## What you get

- Factory-based provider registry with self-registering search backends
- Algolia provider (REST API, native fetch, batch indexing, faceted search)
- Typesense provider (HTTP API, native fetch, auto-schema detection, multi-search)
- Meilisearch provider (HTTP API, native fetch, async indexing with task polling)
- In-memory mock provider with TF-IDF text matching and facet counting
- Reciprocal rank fusion combiner for hybrid keyword + vector search
- Per-instance circuit breakers for resilience
- OTel metrics (request totals, duration, index operations)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Full-text search with pluggable backends` | Project description |
| `SearchProvider` | string | `typesense` | Default search provider (typesense/algolia/meilisearch/mock or custom) |

## Project layout

```text
<ProjectName>/
  src/
    search/
      index.ts              # Main exports -- createSearchClient facade
      types.ts              # SearchIndex, SearchDocument, SearchQuery, SearchResult
      config.ts             # Zod-validated configuration
      bootstrap.ts          # Placeholder detection guard
      logger.ts             # Structured JSON logger
      metrics.ts            # OTel counters and histograms
      providers/
        types.ts            # SearchProvider interface + factory type
        registry.ts         # Factory-based provider registry
        algolia.ts          # Algolia REST API provider
        typesense.ts        # Typesense HTTP API provider
        meilisearch.ts      # Meilisearch HTTP API provider
        mock.ts             # In-memory TF-IDF provider
        index.ts            # Barrel import -- triggers self-registration
      hybrid/
        combiner.ts         # Reciprocal rank fusion (RRF) combiner
      resilience/
        circuit-breaker.ts  # Circuit breaker state machine
        __tests__/
          circuit-breaker.test.ts
      __tests__/
        registry.test.ts
        mock.test.ts
        combiner.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add search to a service
- [rag-pipeline](../rag-pipeline/) -- hybrid keyword + semantic retrieval
- [module-vector-store](../module-vector-store/) -- combine with RRF combiner for hybrid search

## Nests inside

- [monorepo](../monorepo/)
