// ── Flag Store Interface ────────────────────────────────────────────
//
// All flag stores implement this interface. The registry pattern
// allows new stores to be added by calling registerStore() with a
// factory function. Consumer code calls getStore() to obtain an
// instance by name.
//

import type { Flag } from "../types.js";

export interface FlagStore {
  /** Unique store name (e.g., "memory", "redis", "json-file"). */
  readonly name: string;

  /** Initialize the store with configuration. */
  init(config: Record<string, unknown>): Promise<void>;

  /** Retrieve a flag by key. Returns undefined if not found. */
  getFlag(key: string): Promise<Flag | undefined>;

  /** Store or update a flag. */
  setFlag(flag: Flag): Promise<void>;

  /** List all flags in the store. */
  listFlags(): Promise<Flag[]>;

  /** Delete a flag by key. */
  deleteFlag(key: string): Promise<void>;

  /** Gracefully shut down the store, releasing connections. */
  close(): Promise<void>;
}
