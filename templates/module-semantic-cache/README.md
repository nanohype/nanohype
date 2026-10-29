# module-semantic-cache

Embedding-based LLM response caching using vector similarity search.

## What you get

- Semantic cache facade with prompt-level lookup and storage
- Embedding provider registry with self-registering backends
- Gateway embedding provider (the default) that calls the Platform's ModelGateway and holds no model credential, with timeout and circuit breaker
- Bedrock Titan Text v2 provider over the AWS credential chain, and with `IncludeKeyProviders` an OpenAI provider (text-embedding-3-small), for off-substrate use
- Mock embedding provider for deterministic testing (64 dimensions)
- Vector cache store registry with self-registering backends
- In-memory vector store with cosine similarity search and TTL expiration
- Gateway adapter for drop-in integration with LLM gateway caching strategies
- Configurable similarity threshold (default: 0.95) and TTL (default: 1 hour)
- Cosine similarity and vector normalization utilities

## Variables

| Variable              | Type   | Default                              | Description                                                                |
| --------------------- | ------ | ------------------------------------ | -------------------------------------------------------------------------- |
| `ProjectName`         | string | --                                   | Kebab-case project name                                                    |
| `Description`         | string | `Semantic caching for LLM responses` | Project description                                                        |
| `EmbeddingProvider`   | string | `gateway`                            | Embedding provider the README examples name                                |
| `PlatformName`        | string | `ProjectName`                        | Platform CR whose ModelGateway Service the gateway provider defaults to    |
| `IncludeKeyProviders` | bool   | `false`                              | Include the openai provider, which takes a provider key, off the substrate |
| `VectorBackend`       | string | `memory`                             | Default vector store backend (memory or custom)                            |

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
        gateway.ts          # Platform ModelGateway embeddings, no credential
        bedrock.ts          # Bedrock Titan Text v2 over the AWS credential chain
        openai.ts           # OpenAI text-embedding-3-small (IncludeKeyProviders)
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
        gateway-embedder.test.ts
        store-registry.test.ts
        gateway-adapter.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add semantic caching to a service
- [agentic-loop](../agentic-loop/) -- cache LLM responses across agent iterations
- [rag-pipeline](../rag-pipeline/) -- cache retrieval and generation results
- [module-cache-ts](../module-cache-ts/) -- use alongside exact-match caching for a two-tier strategy

## Nests inside

- [monorepo](../monorepo/)
