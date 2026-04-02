import memjs from "memjs";
import type { CacheConfig } from "../types.js";
import type { CacheProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// ── Memcached Cache Provider ───────────────────────────────────────
//
// Cache backed by Memcached via memjs. Supports TTL natively using
// Memcached's expiration flag. Suitable for legacy infrastructure
// or environments where Memcached is already deployed.
//
// Config:
//   servers?: string    (comma-separated, e.g. "host1:11211,host2:11211")
//   username?: string   (optional SASL auth)
//   password?: string   (optional SASL auth)
//

let client: memjs.Client | null = null;

const memcachedProvider: CacheProvider = {
  name: "memcached",

  async init(config: CacheConfig): Promise<void> {
    const servers =
      (config.servers as string) ??
      process.env.MEMCACHED_SERVERS ??
      "127.0.0.1:11211";
    const username = (config.username as string) ?? undefined;
    const password = (config.password as string) ?? undefined;

    client = memjs.Client.create(servers, { username, password });
    console.log(`[cache] Memcached provider connected to ${servers}`);
  },

  async get(key: string): Promise<string | undefined> {
    if (!client) throw new Error("Memcached cache provider not initialized");

    const { value } = await client.get(key);
    if (value === null) return undefined;
    return value.toString();
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!client) throw new Error("Memcached cache provider not initialized");

    // Memcached expiration is in seconds; 0 means no expiration
    const expiration = ttl !== undefined && ttl > 0 ? Math.ceil(ttl / 1000) : 0;
    await client.set(key, value, { expires: expiration });
  },

  async delete(key: string): Promise<void> {
    if (!client) throw new Error("Memcached cache provider not initialized");

    await client.delete(key);
  },

  async has(key: string): Promise<boolean> {
    if (!client) throw new Error("Memcached cache provider not initialized");

    const { value } = await client.get(key);
    return value !== null;
  },

  async clear(): Promise<void> {
    if (!client) throw new Error("Memcached cache provider not initialized");

    await client.flush();
  },

  async close(): Promise<void> {
    if (client) {
      client.close();
      client = null;
      console.log("[cache] Memcached provider closed");
    }
  },
};

// Self-register
registerProvider(memcachedProvider);
