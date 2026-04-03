// ── Chunk Strategy Interface ───────────────────────────────────────
//
// All chunking strategies implement this interface. Each strategy
// splits a document into chunks suitable for embedding and indexing.
//

import type { Document, Chunk } from "../types.js";

export interface ChunkOptions {
  /** Target chunk size in estimated tokens. Default: 512 */
  chunkSize?: number;
  /** Overlap between consecutive chunks in estimated tokens. Default: 64 */
  overlap?: number;
}

export interface ChunkStrategy {
  /** Unique strategy name (e.g. "recursive", "fixed", "semantic"). */
  readonly name: string;

  /**
   * Split a document into chunks.
   *
   * @param document  The document to chunk.
   * @param opts      Chunking configuration options.
   * @returns         Array of chunks with inherited metadata.
   */
  chunk(document: Document, opts?: ChunkOptions): Chunk[];
}
