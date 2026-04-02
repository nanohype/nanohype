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

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # compile TypeScript
npm start       # run compiled output
```

## License

MIT
