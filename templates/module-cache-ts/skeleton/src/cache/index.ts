// ── Module Cache — Main Exports ──────────────────────────────────────
//
// Public API for the cache module. Import providers so they
// self-register, then expose createCache as the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { getProvider, listProviders } from "./providers/index.js";
import { cacheGetTotal, cacheOperationDuration } from "./metrics.js";
import type { CacheProvider } from "./providers/types.js";
import type { CacheConfig, SetOptions } from "./types.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { CacheProvider } from "./providers/types.js";
export type { CacheConfig, CacheEntry, SetOptions } from "./types.js";

// ── Cache Facade ────────────────────────────────────────────────────

export interface Cache {
  /** The underlying provider instance. */
  provider: CacheProvider;

  /** Retrieve a parsed value by key. Returns undefined if not found or expired. */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /** Store a value (serialized to JSON) with optional TTL. */
  set<T = unknown>(key: string, value: T, opts?: SetOptions): Promise<void>;

  /** Delete a key from the cache. */
  delete(key: string): Promise<void>;

  /** Check whether a key exists and has not expired. */
  has(key: string): Promise<boolean>;

  /** Remove all entries from the cache. */
  clear(): Promise<void>;

  /**
   * Cache-aside helper. Returns the cached value if present, otherwise
   * calls the factory function, stores the result, and returns it.
   */
  getOrSet<T = unknown>(
    key: string,
    factory: () => Promise<T>,
    opts?: SetOptions,
  ): Promise<T>;

  /** Shut down the cache and release resources. */
  close(): Promise<void>;
}

/**
 * Create a configured cache instance backed by the named provider.
 *
 * The provider must already be registered (built-in providers
 * self-register on import via the providers barrel).
 *
 * An optional `namespace` separates keys so multiple subsystems can
 * share one provider without collisions.
 *
 *   const cache = await createCache("memory");
 *   await cache.set("user:1", { name: "Alice" }, { ttl: 60_000 });
 *   const user = await cache.get("user:1");
 */
/** Zod schema for validating createCache arguments. */
const CreateCacheSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.object({
    namespace: z.string().optional(),
  }).passthrough(),
});

export async function createCache(
  providerName: string = "__CACHE_PROVIDER__",
  config: CacheConfig = {},
): Promise<Cache> {
  const parsed = CreateCacheSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid cache config: ${issues}`);
  }

  validateBootstrap();

  const provider = getProvider(providerName);
  await provider.init(config);

  const namespace = (config.namespace as string) ?? "";
  const nsPrefix = namespace ? `${namespace}:` : "";

  function nsKey(key: string): string {
    return `${nsPrefix}${key}`;
  }

  return {
    provider,

    async get<T = unknown>(key: string): Promise<T | undefined> {
      const start = performance.now();
      const raw = await provider.get(nsKey(key));
      const durationMs = performance.now() - start;

      cacheOperationDuration.record(durationMs, { operation: "get" });

      if (raw === undefined) {
        cacheGetTotal.add(1, { result: "miss" });
        return undefined;
      }

      cacheGetTotal.add(1, { result: "hit" });
      return JSON.parse(raw) as T;
    },

    async set<T = unknown>(key: string, value: T, opts?: SetOptions): Promise<void> {
      const start = performance.now();
      const serialized = JSON.stringify(value);
      await provider.set(nsKey(key), serialized, opts?.ttl);
      cacheOperationDuration.record(performance.now() - start, { operation: "set" });
    },

    async delete(key: string): Promise<void> {
      const start = performance.now();
      await provider.delete(nsKey(key));
      cacheOperationDuration.record(performance.now() - start, { operation: "delete" });
    },

    async has(key: string): Promise<boolean> {
      const start = performance.now();
      const exists = await provider.has(nsKey(key));
      cacheOperationDuration.record(performance.now() - start, { operation: "has" });
      return exists;
    },

    async clear(): Promise<void> {
      const start = performance.now();
      await provider.clear();
      cacheOperationDuration.record(performance.now() - start, { operation: "clear" });
    },

    async getOrSet<T = unknown>(
      key: string,
      factory: () => Promise<T>,
      opts?: SetOptions,
    ): Promise<T> {
      const start = performance.now();
      const existing = await this.get<T>(key);
      if (existing !== undefined) {
        cacheOperationDuration.record(performance.now() - start, { operation: "getOrSet" });
        return existing;
      }

      const value = await factory();
      await this.set(key, value, opts);
      cacheOperationDuration.record(performance.now() - start, { operation: "getOrSet" });
      return value;
    },

    async close(): Promise<void> {
      await provider.close();
    },
  };
}
