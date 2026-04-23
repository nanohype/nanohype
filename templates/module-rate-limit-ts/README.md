# module-rate-limit-ts

Composable rate limiting with pluggable algorithms and state stores.

## What you get

- **Two registries** — algorithms and stores, both self-registering at import time
- **Three algorithms** — token bucket, sliding window log, and fixed window counter
- **Two stores** — in-memory (Map-backed with TTL) for dev, Redis (ioredis) for production
- **Middleware factories** — `honoMiddleware()` and `expressMiddleware()` ready to drop in
- **Facade API** — `createRateLimiter()` wires algorithm + store together, returns `check(key)` and `reset(key)`
- **Standard result shape** — `{ allowed, remaining, resetAt, limit }` from every algorithm

## Variables

| Variable | Placeholder | Default | Description |
|----------|-------------|---------|-------------|
| `ProjectName` | `__PROJECT_NAME__` | *(required)* | Kebab-case package name |
| `Description` | `__DESCRIPTION__` | Rate limiting middleware with pluggable algorithms | Package description |
| `Algorithm` | `__ALGORITHM__` | `token-bucket` | Default rate limiting algorithm |
| `Store` | `__STORE__` | `memory` | Default state store |

## Project layout

```text
<ProjectName>/
  src/
    rate-limit/
      index.ts              # Facade — createRateLimiter(algorithm, store, config)
      types.ts              # RateLimitConfig, RateLimitResult, RateLimitOptions
      middleware.ts          # honoMiddleware() and expressMiddleware() factories
      algorithms/
        types.ts            # RateLimitAlgorithm interface
        registry.ts         # Algorithm registry (register, get, list)
        token-bucket.ts     # Token bucket using store
        sliding-window.ts   # Sliding window log using store
        fixed-window.ts     # Fixed window counter using store
        index.ts            # Barrel import — triggers self-registration
      stores/
        types.ts            # RateLimitStore interface
        registry.ts         # Store registry (register, get, list)
        memory.ts           # Map-backed store with TTL cleanup
        redis.ts            # ioredis store
        index.ts            # Barrel import — triggers self-registration
      __tests__/
        memory-store.test.ts
        token-bucket.test.ts
        registry.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add rate limiting to a TypeScript HTTP service
- [module-auth-ts](../module-auth-ts/) -- combine auth and rate limiting middleware

## Nests inside

- [monorepo](../monorepo/)
