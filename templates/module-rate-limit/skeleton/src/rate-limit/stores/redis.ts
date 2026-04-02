import Redis from "ioredis";
import type { RateLimitStore, StoreConfig } from "./types.js";
import { registerStore } from "./registry.js";

// ── Redis Store ────────────────────────────────────────────────────
//
// ioredis-backed store for distributed rate limiting. Supports TTL
// natively via Redis PEXPIRE. Suitable for multi-process and
// multi-server deployments.
//
// Config:
//   url?: string        (Redis connection URL, defaults to REDIS_URL env var)
//   host?: string       (defaults to 127.0.0.1)
//   port?: number       (defaults to 6379)
//   password?: string   (optional)
//   keyPrefix?: string  (defaults to "rl:")
//

let client: Redis | null = null;
let keyPrefix = "rl:";

function prefixed(key: string): string {
  return `${keyPrefix}${key}`;
}

const redisStore: RateLimitStore = {
  name: "redis",

  async init(config: StoreConfig): Promise<void> {
    const url =
      (config.url as string) ?? process.env.REDIS_URL ?? undefined;

    if (url) {
      client = new Redis(url);
    } else {
      client = new Redis({
        host: (config.host as string) ?? process.env.REDIS_HOST ?? "127.0.0.1",
        port: Number((config.port as number) ?? process.env.REDIS_PORT ?? 6379),
        password: (config.password as string) ?? process.env.REDIS_PASSWORD ?? undefined,
      });
    }

    keyPrefix = (config.keyPrefix as string) ?? "rl:";
    console.log("[rate-limit] Redis store connected");
  },

  async get(key: string): Promise<string | null> {
    if (!client) throw new Error("Redis store not initialized");
    return client.get(prefixed(key));
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!client) throw new Error("Redis store not initialized");
    if (ttl) {
      await client.set(prefixed(key), value, "PX", ttl);
    } else {
      await client.set(prefixed(key), value);
    }
  },

  async increment(key: string, ttl?: number): Promise<number> {
    if (!client) throw new Error("Redis store not initialized");
    const pk = prefixed(key);
    const value = await client.incr(pk);

    // Set TTL only on first increment (value === 1)
    if (ttl && value === 1) {
      await client.pexpire(pk, ttl);
    }

    return value;
  },

  async getList(key: string): Promise<string[]> {
    if (!client) throw new Error("Redis store not initialized");
    return client.lrange(prefixed(key), 0, -1);
  },

  async appendList(key: string, value: string, ttl?: number): Promise<void> {
    if (!client) throw new Error("Redis store not initialized");
    const pk = prefixed(key);
    await client.rpush(pk, value);
    if (ttl) {
      await client.pexpire(pk, ttl);
    }
  },

  async delete(key: string): Promise<void> {
    if (!client) throw new Error("Redis store not initialized");
    await client.del(prefixed(key));
  },

  async close(): Promise<void> {
    if (client) {
      await client.quit();
      client = null;
      console.log("[rate-limit] Redis store closed");
    }
  },
};

// Self-register
registerStore(redisStore);
