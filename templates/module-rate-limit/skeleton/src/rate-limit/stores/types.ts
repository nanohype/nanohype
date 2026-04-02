// ── Rate Limit Store Interface ──────────────────────────────────────
//
// All state stores implement this interface. The registry pattern
// allows new stores to be added by importing a store module that
// calls registerStore() at the module level.
//

/** Configuration passed to store init. */
export interface StoreConfig {
  /** Store-specific connection or configuration options. */
  [key: string]: unknown;
}

/**
 * Contract that all rate limit stores must implement. Each store is
 * responsible for persisting rate limit state (counters, timestamps,
 * lists) with optional TTL-based expiration.
 */
export interface RateLimitStore {
  /** Unique store name (e.g. "memory", "redis"). */
  readonly name: string;

  /** Initialize the store with configuration. */
  init(config: StoreConfig): Promise<void>;

  /** Get a value by key. Returns null if the key does not exist. */
  get(key: string): Promise<string | null>;

  /** Set a key to a value with an optional TTL in milliseconds. */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /** Increment a numeric key by 1, returning the new value. Creates the key with value 1 if it does not exist. */
  increment(key: string, ttl?: number): Promise<number>;

  /** Get all items in a list stored at key. */
  getList(key: string): Promise<string[]>;

  /** Append a value to a list at key, with an optional TTL on the list. */
  appendList(key: string, value: string, ttl?: number): Promise<void>;

  /** Delete a key and its associated data. */
  delete(key: string): Promise<void>;

  /** Gracefully shut down the store, releasing connections. */
  close(): Promise<void>;
}
