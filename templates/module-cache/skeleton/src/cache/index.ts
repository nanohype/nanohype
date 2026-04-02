// ── Module Cache — Main Exports ──────────────────────────────────────
//
// Public API for the cache module. Import providers so they
// self-register, then expose createCache as the primary entry point.
//

import { getProvider, listProviders } from "./providers/index.js";
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
export async function createCache(
  providerName: string = "__CACHE_PROVIDER__",
  config: CacheConfig = {},
): Promise<Cache> {
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
      const raw = await provider.get(nsKey(key));
      if (raw === undefined) return undefined;
      return JSON.parse(raw) as T;
    },

    async set<T = unknown>(key: string, value: T, opts?: SetOptions): Promise<void> {
      const serialized = JSON.stringify(value);
      await provider.set(nsKey(key), serialized, opts?.ttl);
    },

    async delete(key: string): Promise<void> {
      await provider.delete(nsKey(key));
    },

    async has(key: string): Promise<boolean> {
      return provider.has(nsKey(key));
    },

    async clear(): Promise<void> {
      await provider.clear();
    },

    async getOrSet<T = unknown>(
      key: string,
      factory: () => Promise<T>,
      opts?: SetOptions,
    ): Promise<T> {
      const existing = await this.get<T>(key);
      if (existing !== undefined) return existing;

      const value = await factory();
      await this.set(key, value, opts);
      return value;
    },

    async close(): Promise<void> {
      await provider.close();
    },
  };
}
