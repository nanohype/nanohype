// ── Database Driver Interface ────────────────────────────────────────
//
// All database drivers implement this interface. The registry pattern
// allows new drivers to be added by importing a driver module that
// calls registerDriver() at the module level.
//

export interface DatabaseDriver {
  /** Unique driver name (e.g. "postgres", "sqlite") */
  readonly name: string;

  /**
   * Connect to the database using the provided connection string.
   * Returns the underlying client for use with Drizzle ORM.
   */
  connect(connectionString: string): Promise<unknown>;

  /** Gracefully close the connection. */
  disconnect(): Promise<void>;
}
