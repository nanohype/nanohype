import Redis from "ioredis";
import type { CacheConfig } from "../types.js";
import type { CacheProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── Redis Cache Provider ───────────────────────────────────────────
//
// Distributed cache backed by Redis via ioredis. Supports TTL natively
// using Redis PSETEX. Suitable for production multi-process deployments.
//
// Config:
//   url?: string          (full Redis URL, e.g. redis://host:6379)
//   host?: string         (default: REDIS_HOST or 127.0.0.1)
//   port?: number         (default: REDIS_PORT or 6379)
//   password?: string     (optional)
//   keyPrefix?: string    (optional prefix for all keys)
//

let client: Redis | null = null;
let keyPrefix = "";

function prefixed(key: string): string {
  return keyPrefix ? `${keyPrefix}${key}` : key;
}

const redisProvider: CacheProvider = {
  name: "redis",

  async init(config: CacheConfig): Promise<void> {
    const url =
      (config.url as string) ?? process.env.REDIS_URL ?? undefined;
    const host =
      (config.host as string) ?? process.env.REDIS_HOST ?? "127.0.0.1";
    const port =
      Number((config.port as number) ?? process.env.REDIS_PORT ?? 6379);
    const password = (config.password as string) ?? undefined;
    keyPrefix = (config.keyPrefix as string) ?? "";

    if (url) {
      client = new Redis(url);
    } else {
      client = new Redis({ host, port, password });
    }

    // Verify connectivity — fail fast if Redis is unreachable
    try {
      await client.ping();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.quit().catch(() => {});
      client = null;
      throw new Error(`Redis connection failed: ${message}`);
    }

    console.log(`[cache] Redis provider connected to ${url ?? `${host}:${port}`}`);
  },

  async get(key: string): Promise<string | undefined> {
    if (!client) throw new Error("Redis cache provider not initialized");

    const value = await client.get(prefixed(key));
    return value ?? undefined;
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!client) throw new Error("Redis cache provider not initialized");

    if (ttl !== undefined && ttl > 0) {
      await client.psetex(prefixed(key), ttl, value);
    } else {
      await client.set(prefixed(key), value);
    }
  },

  async delete(key: string): Promise<void> {
    if (!client) throw new Error("Redis cache provider not initialized");

    await client.del(prefixed(key));
  },

  async has(key: string): Promise<boolean> {
    if (!client) throw new Error("Redis cache provider not initialized");

    const exists = await client.exists(prefixed(key));
    return exists === 1;
  },

  async clear(): Promise<void> {
    if (!client) throw new Error("Redis cache provider not initialized");

    if (keyPrefix) {
      // Only clear keys with our prefix
      const keys = await client.keys(`${keyPrefix}*`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } else {
      await client.flushdb();
    }
  },

  async close(): Promise<void> {
    if (client) {
      await client.quit();
      client = null;
      console.log("[cache] Redis provider closed");
    }
  },
};

// Self-register
registerProvider("redis", () => redisProvider);
