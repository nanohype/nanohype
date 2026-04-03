// ── Ingest Source Interface ─────────────────────────────────────────
//
// All ingest sources implement this interface. Each source handles
// loading documents from a specific type of origin (local files, web
// pages, etc.) and returns them as Document arrays.
//

import type { Document } from "../types.js";

export interface IngestSource {
  /** Unique source name (e.g. "file", "web"). */
  readonly name: string;

  /**
   * Load documents from the given path or URL.
   *
   * @param location  File path, directory path, or URL to load from.
   * @returns         Array of loaded documents.
   */
  load(location: string): Promise<Document[]>;
}
