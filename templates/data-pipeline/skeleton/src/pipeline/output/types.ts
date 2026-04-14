// ── Output Adapter Interface ────────────────────────────────────────
//
// All output adapters implement this interface. Each adapter writes
// embedded chunks to a destination (file, stdout, vector store, etc.).
// The EmbeddedChunk shape is compatible with module-vector-store's
// VectorDocument interface.
//

import type { EmbeddedChunk } from "../types.js";

export interface OutputAdapterConfig {
  /** Adapter-specific configuration values. */
  [key: string]: unknown;
}

export interface OutputAdapter {
  /** Unique adapter name (e.g. "json-file", "console"). */
  readonly name: string;

  /**
   * Initialize the adapter with configuration.
   * Called once before the first write.
   *
   * @param config  Adapter-specific configuration.
   */
  init(config: OutputAdapterConfig): Promise<void>;

  /**
   * Write a batch of embedded chunks to the output destination.
   *
   * @param chunks  Array of embedded chunks to write.
   */
  write(chunks: EmbeddedChunk[]): Promise<void>;

  /**
   * Finalize and release resources.
   * Called once after all writes are complete.
   */
  close(): Promise<void>;
}
