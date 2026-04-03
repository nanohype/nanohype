# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createSearchClient } from "./search/index.js";

const client = await createSearchClient("__SEARCH_PROVIDER__");

// Create an index
await client.createIndex({
  name: "articles",
  fields: [
    { name: "id", type: "string", primary: true },
    { name: "content", type: "string" },
    { name: "category", type: "string", facet: true },
  ],
});

// Index documents
await client.indexDocuments("articles", [
  { id: "1", content: "TypeScript is a typed superset of JavaScript", metadata: { category: "tech" } },
  { id: "2", content: "Python is great for data science", metadata: { category: "tech" } },
]);

// Search with facets
const results = await client.search("articles", {
  query: "TypeScript",
  facets: ["category"],
  limit: 10,
});

console.log(`Found ${results.totalHits} results in ${results.processingTimeMs}ms`);
for (const hit of results.hits) {
  console.log(`  [${hit.score.toFixed(2)}] ${hit.id}: ${hit.content}`);
}
```

## Hybrid Search (RRF)

Combine keyword and vector results with reciprocal rank fusion:

```typescript
import { createSearchClient, reciprocalRankFusion } from "./search/index.js";

const keywordResults = await client.search("articles", { query: "machine learning" });

// vectorResults from module-vector-store or any source with { id, content, score, metadata }
const merged = reciprocalRankFusion(keywordResults.hits, vectorResults);
console.log(`Merged ${merged.totalHits} results`);
```

## Providers

| Provider | Backend | Auth | Use Case |
|----------|---------|------|----------|
| `typesense` | Typesense HTTP API | `TYPESENSE_API_KEY` | Self-hosted, typo-tolerant |
| `algolia` | Algolia REST API | `ALGOLIA_APP_ID` + `ALGOLIA_API_KEY` | Managed, low-latency |
| `meilisearch` | Meilisearch HTTP API | `MEILISEARCH_MASTER_KEY` | Self-hosted, async indexing |
| `mock` | In-memory TF-IDF | none | Development, testing |

## Custom Providers

Register a new provider factory:

```typescript
import { registerProvider } from "./search/providers/index.js";
import type { SearchProvider } from "./search/providers/types.js";

function createMyProvider(): SearchProvider {
  return {
    name: "my-search",
    async init(config) { /* ... */ },
    async createIndex(index) { /* ... */ },
    async indexDocuments(indexName, docs) { /* ... */ },
    async search(indexName, query) {
      return { hits: [], totalHits: 0, processingTimeMs: 0 };
    },
    async deleteDocuments(indexName, ids) { /* ... */ },
    async getIndex(indexName) { return undefined; },
    async deleteIndex(indexName) { /* ... */ },
    async close() { /* ... */ },
  };
}

registerProvider("my-search", createMyProvider);
```

## Architecture

- **Factory-based registry** -- `registerProvider(name, factory)` stores a factory function, and `getProvider(name)` calls it to produce a fresh instance. No module-level mutable state is shared between callers -- each instance has its own API client, circuit breaker, and internal state.
- **Lazy API initialization** -- API clients are created on first use inside each factory closure, not at import time. This avoids side effects from module loading.
- **Per-instance circuit breakers** -- each provider instance gets its own circuit breaker via the factory. Failures in one consumer's provider do not affect other consumers.
- **Native fetch** -- all providers use native fetch (no heavy SDKs). Algolia, Typesense, and Meilisearch REST/HTTP APIs are called directly.
- **Reciprocal rank fusion** -- the hybrid combiner merges keyword and vector results using `score = sum(1 / (k + rank))`. Compatible with both this module's SearchResult and module-vector-store's SearchResult shape.
- **TF-IDF mock** -- the in-memory mock provider tokenizes documents, computes TF-IDF scores, and supports facet counting. Suitable for development and testing without external services.
- **OTel metrics** -- request totals, duration, and index operations are recorded as OTel counters and histograms. No-ops when no SDK is configured.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.
- **Zod config validation** -- `createSearchClient()` validates configuration at construction time, catching errors early.

## Production Readiness

- [ ] Set API keys for your chosen provider (see `.env.example`)
- [ ] Configure index schemas with appropriate field types and facets
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Wire in OpenTelemetry SDK for metrics collection
- [ ] Monitor `search_request_total` and `search_duration_ms` dashboards
- [ ] Set circuit breaker thresholds appropriate for your traffic volume
- [ ] Test failover behavior when the search backend is unavailable
- [ ] Consider hybrid search with module-vector-store for semantic + keyword

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm test        # run tests
npm start       # run compiled output
```

## License

Apache-2.0
