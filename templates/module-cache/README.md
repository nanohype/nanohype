# module-cache

Composable caching with pluggable backends.

## What you get

- Provider registry pattern with self-registering cache backends
- In-memory provider for development and testing (with TTL expiration)
- Redis provider for distributed caching via ioredis
- Memcached provider for legacy infrastructure via memjs
- Namespace support for key isolation between subsystems
- Cache-aside helper (`getOrSet`) for read-through patterns
- TTL support on all providers

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `Pluggable caching layer with TTL and namespace support` | Project description |
| `CacheProvider` | string | `memory` | Default cache provider (memory/redis/memcached or custom) |

## Project layout

```text
<ProjectName>/
  src/
    cache/
      index.ts              # Main exports — createCache facade
      types.ts              # CacheConfig, CacheEntry interfaces
      providers/
        types.ts            # CacheProvider interface
        registry.ts         # Provider registry (register, get, list)
        memory.ts           # In-memory cache (dev/testing)
        redis.ts            # Redis-backed cache via ioredis
        memcached.ts        # Memcached-backed cache via memjs
        index.ts            # Barrel import — triggers self-registration
      __tests__/
        registry.test.ts
        memory.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add caching to a service
- [agentic-loop](../agentic-loop/) -- cache LLM responses and tool results
- [rag-pipeline](../rag-pipeline/) -- cache embeddings and retrieval results

## Nests inside

- [monorepo](../monorepo/)
