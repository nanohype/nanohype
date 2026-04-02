// ── Database Driver Interface ────────────────────────────────────────
//
// All database drivers implement this interface. The registry pattern
// allows new drivers to be added by importing a driver module that
// calls registerDriver() at the module level.
//
// Each driver is responsible for:
//   - Establishing and pooling connections appropriate to its backend
//   - Returning a Drizzle ORM instance from connect()
//   - Tearing down connections cleanly in disconnect()
//

export interface DatabaseDriver {
  /** Unique driver name (e.g. "postgres", "sqlite", "turso") */
  readonly name: string;

  /**
   * Connect to the database using the provided URL/path.
   * Returns a Drizzle ORM instance ready for queries.
   *
   * @param url     Connection string, file path, or Turso URL
   * @param options Driver-specific configuration overrides
   */
  connect(url: string, options?: Record<string, unknown>): Promise<unknown>;

  /** Gracefully close all connections and release resources. */
  disconnect(): Promise<void>;
}
