# __PROJECT_NAME__

__DESCRIPTION__

## Quick Start

```typescript
import { createCache } from "./cache/index.js";

const cache = await createCache("__CACHE_PROVIDER__");

// Store a value with a 60-second TTL
await cache.set("user:1", { name: "Alice", role: "admin" }, { ttl: 60_000 });

// Retrieve it
const user = await cache.get("user:1");
console.log(user); // { name: "Alice", role: "admin" }

// Cache-aside pattern — fetch from DB on miss, cache the result
const profile = await cache.getOrSet(
  "profile:1",
  async () => {
    // expensive lookup
    return { name: "Alice", bio: "Engineer" };
  },
  { ttl: 300_000 },
);
```

## Providers

| Provider | Backend | Use Case |
|----------|---------|----------|
| `memory` | In-process Map | Development, testing |
| `redis` | Redis | Production, distributed |
| `memcached` | Memcached | Legacy infrastructure |

### Memory

No configuration needed. Entries are stored in memory and lost on process exit.

### Redis

Requires a running Redis instance.

```typescript
const cache = await createCache("redis", {
  host: "127.0.0.1",
  port: 6379,
});
```

Or set environment variables:

- `REDIS_URL` (full connection string, takes precedence)
- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: `6379`)

### Memcached

Requires a running Memcached instance.

```typescript
const cache = await createCache("memcached", {
  servers: "127.0.0.1:11211",
});
```

Or set environment variables:

- `MEMCACHED_SERVERS` (default: `127.0.0.1:11211`)

## Namespacing

Isolate keys by passing a `namespace` in config:

```typescript
const userCache = await createCache("memory", { namespace: "users" });
const sessionCache = await createCache("memory", { namespace: "sessions" });

// These do not collide — stored as "users:alice" and "sessions:alice"
await userCache.set("alice", { role: "admin" });
await sessionCache.set("alice", { token: "abc123" });
```

## Custom Providers

Implement the `CacheProvider` interface and register it:

```typescript
import { registerProvider } from "./cache/providers/index.js";
import type { CacheProvider } from "./cache/providers/index.js";

const myProvider: CacheProvider = {
  name: "my-store",
  async init(config) { /* ... */ },
  async get(key) { /* ... */ return value; },
  async set(key, value, ttl) { /* ... */ },
  async delete(key) { /* ... */ },
  async has(key) { /* ... */ return true; },
  async clear() { /* ... */ },
  async close() { /* ... */ },
};

registerProvider(myProvider);
```

## Architecture

- **Cache facade** -- `createCache()` returns a high-level `Cache` object that wraps any provider behind a uniform `get` / `set` / `delete` / `has` / `getOrSet` / `close` API. Application code never touches provider internals.
- **Provider registry with self-registration** -- each provider module (memory, redis, memcached) calls `registerProvider()` at import time. Adding a custom provider is one `registerProvider()` call.
- **`getOrSet` cache-aside pattern** -- the facade method checks for a cached value, calls the factory function on a miss, stores the result with the specified TTL, and returns it. This is the primary read path for most use cases.
- **Namespace isolation** -- an optional `namespace` config prefixes all keys (e.g., `users:alice`), allowing multiple subsystems to share one provider instance without key collisions.
- **JSON serialization boundary** -- the facade serializes values to JSON on `set` and deserializes on `get`. Providers only deal with raw strings, keeping their implementations simple.
- **Zod input validation** -- `createCache()` validates its arguments against a schema before initializing the provider, catching configuration errors at construction time.
- **Bootstrap guard** -- detects unresolved scaffolding placeholders and halts with a diagnostic message before any provider initialization.

## Production Readiness

- [ ] Set all environment variables (`REDIS_URL` or `MEMCACHED_SERVERS`)
- [ ] Choose a persistent provider (redis or memcached) -- memory provider loses data on restart
- [ ] Set appropriate TTL values per cache key to balance freshness and hit rate
- [ ] Set `LOG_LEVEL=warn` for production
- [ ] Monitor cache hit/miss ratio and eviction rate
- [ ] Size your Redis/Memcached instance for your working set
- [ ] Test failover behavior -- ensure the app degrades gracefully if the cache is unavailable
- [ ] Use namespace isolation when multiple services share a cache instance

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm start       # run compiled output
```

## License

MIT
