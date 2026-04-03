# module-vector-store

Pluggable vector database abstraction for embedding storage and similarity search with providers for in-memory, PostgreSQL (pgvector), Qdrant, and Pinecone.

## What you get

- VectorStoreProvider interface with upsert, query, delete, count, and close operations
- Self-registering provider pattern for extensibility
- In-memory provider with cosine similarity ranking and metadata filtering
- PostgreSQL + pgvector provider using `<=>` cosine distance operator
- Qdrant provider via native HTTP API (no SDK dependency)
- Pinecone provider via @pinecone-database/pinecone SDK with batched upserts
- Composable filter expression compiler (eq, ne, gt, lt, gte, lte, in, and, or)
- Similarity math utilities (cosine, dot product, normalize, magnitude)
- Circuit breaker for resilience against backend failures
- Mock provider for deterministic testing

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Pluggable vector store for embedding storage and similarity search` | Project description |
| `VectorProvider` | string | `memory` | Default vector backend (memory/pgvector/qdrant/pinecone or custom) |

## Project layout

```text
<ProjectName>/
  src/
    vector-store/
      index.ts                # Main export -- createVectorStore(provider, config)
      types.ts                # VectorDocument, SearchResult, VectorStoreConfig
      similarity.ts           # cosineSimilarity, dotProduct, normalize, magnitude
      helpers.ts              # withRetry, batchChunk
      bootstrap.ts            # Unresolved placeholder guard
      providers/
        types.ts              # VectorStoreProvider interface
        registry.ts           # Provider registry
        memory.ts             # In-memory provider (Map + cosine similarity)
        pgvector.ts           # PostgreSQL + pgvector provider
        qdrant.ts             # Qdrant HTTP API provider
        pinecone.ts           # Pinecone SDK provider
        mock.ts               # Deterministic test provider
        index.ts              # Barrel import + re-exports
      filters/
        types.ts              # FilterExpression type
        compiler.ts           # compileFilter(filter, backend)
      resilience/
        circuit-breaker.ts    # Circuit breaker state machine
  package.json
  tsconfig.json
  vitest.config.ts
  eslint.config.js
  .prettierrc
  .env.example
  .gitignore
  README.md
```

## Pairs with

- [ts-service](../ts-service/) -- add vector search to an HTTP service
- [rag-pipeline](../rag-pipeline/) -- store and retrieve document embeddings
- [agentic-loop](../agentic-loop/) -- semantic memory for AI agents

## Nests inside

- [monorepo](../monorepo/)
