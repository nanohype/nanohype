# module-semantic-cache

Embedding-based LLM response caching using vector similarity search.

## What you get

- Semantic cache facade with prompt-level lookup and storage
- Embedding provider registry with self-registering backends
- OpenAI embedding provider (text-embedding-3-small, 1536 dimensions) with circuit breaker
- Mock embedding provider for deterministic testing (64 dimensions)
- Vector cache store registry with self-registering backends
- In-memory vector store with cosine similarity search and TTL expiration
- Gateway adapter for drop-in integration with LLM gateway caching strategies
- Configurable similarity threshold (default: 0.95) and TTL (default: 1 hour)
- Cosine similarity and vector normalization utilities

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `Semantic caching for LLM responses` | Project description |
| `EmbeddingProvider` | string | `openai` | Default embedding provider (openai/mock or custom) |
| `VectorBackend` | string | `memory` | Default vector store backend (memory or custom) |

## Project layout

```text
<ProjectName>/
  src/
    semantic-cache/
      index.ts              # Main exports -- createSemanticCache facade
      types.ts              # CacheVector, CacheHit, SemanticCacheConfig
      similarity.ts         # cosineSimilarity, normalize
      circuit-breaker.ts    # Circuit breaker for external API calls
      gateway-adapter.ts    # LLM gateway CachingStrategy adapter
      embedder/
        types.ts            # EmbeddingProvider interface
        registry.ts         # Provider registry (register, get, list)
        openai.ts           # OpenAI text-embedding-3-small
        mock.ts             # Deterministic hash-based embeddings
        index.ts            # Barrel import -- triggers self-registration
      store/
        types.ts            # VectorCacheStore interface
        registry.ts         # Store registry (register, get, list)
        memory.ts           # In-memory Map-backed vector store
        index.ts            # Barrel import -- triggers self-registration
      __tests__/
        cache.test.ts
        similarity.test.ts
        embedder-registry.test.ts
        store-registry.test.ts
        gateway-adapter.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add semantic caching to a service
- [agentic-loop](../agentic-loop/) -- cache LLM responses across agent iterations
- [rag-pipeline](../rag-pipeline/) -- cache retrieval and generation results
- [module-cache](../module-cache/) -- use alongside exact-match caching for a two-tier strategy

## Nests inside

- [monorepo](../monorepo/)
