# __PROJECT_NAME__

__DESCRIPTION__

Pluggable vector store module with provider backends for in-memory (cosine similarity), PostgreSQL (pgvector), Qdrant (HTTP API), and Pinecone (SDK). Includes a composable filter expression compiler and similarity math utilities.

## Quick Start

```typescript
import { createVectorStore } from "./vector-store/index.js";

// Create a store with the default provider (__VECTOR_PROVIDER__)
const store = await createVectorStore("__VECTOR_PROVIDER__", {
  // Provider-specific config goes here
  // connectionString: "postgresql://...",  // pgvector
  // url: "http://localhost:6333",          // qdrant
  // apiKey: "...", index: "my-index",      // pinecone
});

// Upsert documents with embeddings
await store.upsert([
  {
    id: "doc-1",
    content: "TypeScript is a typed superset of JavaScript",
    embedding: [0.1, 0.2, 0.3, /* ... */],
    metadata: { source: "docs", language: "en" },
  },
]);

// Query by embedding vector
const results = await store.query(
  [0.1, 0.2, 0.3, /* ... */],
  5,  // top-K
);

for (const result of results) {
  console.log(`${result.id}: ${result.score.toFixed(4)} — ${result.content}`);
}

// Query with metadata filtering
const filtered = await store.query(
  [0.1, 0.2, 0.3],
  10,
  { field: "language", op: "eq", value: "en" },
);

// Count documents
const total = await store.count();

// Delete by ID
await store.delete(["doc-1"]);

// Clean up
await store.close();
```

## Providers

| Provider | Backend | Config | Best For |
|---|---|---|---|
| `memory` | Map + cosine similarity | none | Development, testing, small datasets |
| `pgvector` | PostgreSQL + pgvector extension | `connectionString`, `tableName`, `dimensions` | Existing Postgres infrastructure |
| `qdrant` | Qdrant HTTP API | `url`, `apiKey`, `collection`, `dimensions` | Dedicated vector search at scale |
| `pinecone` | Pinecone SDK | `apiKey`, `index`, `namespace` | Managed vector search, zero-ops |
| `mock` | Deterministic hash scoring | none | Unit tests with predictable output |

### Memory (default)

```typescript
const store = await createVectorStore("memory", {});
```

### PostgreSQL + pgvector

```typescript
const store = await createVectorStore("pgvector", {
  connectionString: "postgresql://user:pass@localhost:5432/vectors",
  tableName: "embeddings",   // default: "embeddings"
  dimensions: 1536,          // default: 1536 (OpenAI ada-002)
});
```

Requires the `pgvector` PostgreSQL extension. The provider creates the table and extension on init.

### Qdrant

```typescript
const store = await createVectorStore("qdrant", {
  url: "http://localhost:6333",
  apiKey: "your-api-key",         // optional for local
  collection: "embeddings",       // default: "embeddings"
  dimensions: 1536,
});
```

Uses native `fetch` — no Qdrant SDK dependency. Creates the collection on init if it does not exist.

### Pinecone

```typescript
const store = await createVectorStore("pinecone", {
  apiKey: "your-pinecone-api-key",
  index: "my-index",
  namespace: "default",  // optional
});
```

Batches upserts at 100 vectors per request to stay under Pinecone limits.

## Filter Expressions

Filters are composable expressions that translate to each backend's native format.

### Comparison operators

```typescript
// Equality
{ field: "category", op: "eq", value: "docs" }

// Inequality
{ field: "status", op: "ne", value: "archived" }

// Numeric comparisons
{ field: "score", op: "gt", value: 0.8 }
{ field: "score", op: "gte", value: 0.5 }
{ field: "count", op: "lt", value: 100 }
{ field: "count", op: "lte", value: 50 }

// Set membership
{ field: "tag", op: "in", value: ["typescript", "python", "go"] }
```

### Logical combinators

```typescript
// AND — all conditions must match
{
  and: [
    { field: "language", op: "eq", value: "en" },
    { field: "score", op: "gte", value: 0.5 },
  ]
}

// OR — at least one condition must match
{
  or: [
    { field: "source", op: "eq", value: "docs" },
    { field: "source", op: "eq", value: "wiki" },
  ]
}

// Nested — combine AND and OR
{
  and: [
    { field: "language", op: "eq", value: "en" },
    {
      or: [
        { field: "source", op: "eq", value: "docs" },
        { field: "source", op: "eq", value: "wiki" },
      ]
    }
  ]
}
```

## Custom Providers

Implement the `VectorStoreProvider` interface and register it:

```typescript
import { registerProvider } from "./vector-store/providers/registry.js";
import type { VectorStoreProvider } from "./vector-store/providers/types.js";

class MyProvider implements VectorStoreProvider {
  readonly name = "my-provider";
  // ... implement all methods
}

registerProvider(new MyProvider());
```

Then use it by name:

```typescript
const store = await createVectorStore("my-provider", { /* config */ });
```

## Architecture

- **VectorStore facade** — `createVectorStore()` validates config with Zod, initializes a provider by name, and returns a `VectorStore` that delegates all operations (upsert, query, delete, count, close) to the underlying provider. Application code never touches provider internals.
- **Provider registry with self-registration** — each provider module (memory, pgvector, qdrant, pinecone, mock) calls `registerProvider()` at import time. The barrel import ensures all built-in providers are available. Adding a custom provider is one class + one `registerProvider()` call.
- **Filter expression compiler** — `compileFilter(expr, backend)` translates a portable filter tree into SQL WHERE clauses (pgvector), Qdrant filter objects, Pinecone metadata filters, or in-memory predicate functions. The same filter expression works across all backends.
- **Similarity math** — `cosineSimilarity()`, `dotProduct()`, `normalize()`, `magnitude()` are pure functions used by the memory provider and available for embedding pre-processing.
- **`withRetry` exponential backoff** — network operations use `withRetry()` which retries on transient errors (ECONNRESET, ETIMEDOUT, 429, 5xx) with exponential backoff and jitter. Non-retryable errors propagate immediately.
- **`batchChunk` for payload limits** — splits document arrays into fixed-size batches for providers with upsert size limits (Pinecone: 100 per request).
- **Circuit breaker** — wraps provider calls with a failure-counting state machine (closed/open/half-open) to fast-fail when a backend is down.
- **Bootstrap guard** — detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.

## Production Readiness

- [ ] Choose a production provider (pgvector, qdrant, or pinecone) — memory is for development only
- [ ] Set provider-specific environment variables or credentials
- [ ] Configure vector dimensions to match your embedding model (e.g. 1536 for OpenAI, 768 for sentence-transformers)
- [ ] Review and tune batch sizes for your upsert workloads
- [ ] Set up the circuit breaker around provider calls for resilience
- [ ] Monitor query latency and result quality
- [ ] Configure index parameters for your dataset size (pgvector IVFFlat lists, Qdrant HNSW params)
- [ ] Set up backup and replication for your vector database
- [ ] Restrict API keys and credentials to minimum required permissions

## Requirements

- Node.js >= 22
- TypeScript >= 5.8
