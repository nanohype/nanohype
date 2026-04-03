import Redis from "ioredis";
import type { Flag } from "../types.js";
import type { FlagStore } from "./types.js";
import { registerStore } from "./registry.js";

// ── Redis Flag Store ────────────────────────────────────────────────
//
// Distributed flag store backed by Redis via ioredis. Flags are
// stored as JSON-serialized hash entries under a configurable key
// prefix. Suitable for production multi-process deployments where
// flag changes need to be visible across all instances.
//
// Config:
//   url?: string          (full Redis URL, e.g. redis://host:6379)
//   host?: string         (default: REDIS_HOST or 127.0.0.1)
//   port?: number         (default: REDIS_PORT or 6379)
//   password?: string     (optional)
//   keyPrefix?: string    (optional prefix for all keys, default: "flags:")
//

function createRedisStore(): FlagStore {
  let client: Redis | null = null;
  let keyPrefix = "flags:";

  function prefixed(key: string): string {
    return `${keyPrefix}${key}`;
  }

  return {
    name: "redis",

    async init(config: Record<string, unknown>): Promise<void> {
      const url =
        (config.url as string) ?? process.env.REDIS_URL ?? undefined;
      const host =
        (config.host as string) ?? process.env.REDIS_HOST ?? "127.0.0.1";
      const port =
        Number((config.port as number) ?? process.env.REDIS_PORT ?? 6379);
      const password = (config.password as string) ?? undefined;
      keyPrefix = (config.keyPrefix as string) ?? "flags:";

      if (url) {
        client = new Redis(url);
      } else {
        client = new Redis({ host, port, password });
      }

      try {
        await client.ping();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await client.quit().catch(() => {});
        client = null;
        throw new Error(`Redis flag store connection failed: ${message}`);
      }

      console.log(`[flags] Redis store connected to ${url ?? `${host}:${port}`}`);
    },

    async getFlag(key: string): Promise<Flag | undefined> {
      if (!client) throw new Error("Redis flag store not initialized");
      const raw = await client.get(prefixed(key));
      if (!raw) return undefined;
      return JSON.parse(raw) as Flag;
    },

    async setFlag(flag: Flag): Promise<void> {
      if (!client) throw new Error("Redis flag store not initialized");
      const updated = { ...flag, updatedAt: new Date().toISOString() };
      await client.set(prefixed(flag.key), JSON.stringify(updated));
    },

    async listFlags(): Promise<Flag[]> {
      if (!client) throw new Error("Redis flag store not initialized");
      const keys = await client.keys(`${keyPrefix}*`);
      if (keys.length === 0) return [];

      const pipeline = client.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      const results = await pipeline.exec();
      if (!results) return [];

      const flags: Flag[] = [];
      for (const [err, raw] of results) {
        if (!err && typeof raw === "string") {
          flags.push(JSON.parse(raw) as Flag);
        }
      }
      return flags;
    },

    async deleteFlag(key: string): Promise<void> {
      if (!client) throw new Error("Redis flag store not initialized");
      await client.del(prefixed(key));
    },

    async close(): Promise<void> {
      if (client) {
        await client.quit();
        client = null;
        console.log("[flags] Redis store closed");
      }
    },
  };
}

// Self-register
registerStore("redis", createRedisStore);
