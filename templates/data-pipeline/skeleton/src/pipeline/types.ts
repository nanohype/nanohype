// ── Pipeline Types ──────────────────────────────────────────────────
//
// Core types for the data pipeline. These flow through each stage:
// ingest produces Documents, transform produces Chunks, embed produces
// EmbeddedChunks, and the output adapter writes them to a destination.
//

import type { z } from "zod";
import type { configSchema } from "./index.js";

/** Pipeline configuration parsed from environment variables. */
export type PipelineConfig = z.infer<typeof configSchema>;

/** A document loaded by an ingest source. */
export interface Document {
  /** Unique identifier (typically derived from source path or URL). */
  id: string;
  /** Raw text content of the document. */
  content: string;
  /** Source-specific metadata (filename, URL, content type, etc.). */
  metadata: Record<string, unknown>;
}

/** A chunk produced by a transform strategy. */
export interface Chunk {
  /** Unique identifier (parent document ID + chunk index). */
  id: string;
  /** Text content of the chunk. */
  content: string;
  /** Index of this chunk within its parent document. */
  chunkIndex: number;
  /** Total number of chunks from the parent document. */
  chunkCount: number;
  /** Inherited and chunk-specific metadata. */
  metadata: Record<string, unknown>;
}

/** A chunk with its embedding vector attached. */
export interface EmbeddedChunk {
  /** Unique identifier (same as the source Chunk). */
  id: string;
  /** Text content of the chunk. */
  content: string;
  /** Dense float embedding vector. */
  embedding: number[];
  /** All metadata from the chunk plus embedding-specific fields. */
  metadata: Record<string, unknown>;
}

/** Progress callback payload. */
export interface ProgressEvent {
  /** Current pipeline stage. */
  stage: "ingest" | "transform" | "embed" | "index";
  /** Number of items processed so far in this stage. */
  processed: number;
  /** Total items expected in this stage (0 if unknown). */
  total: number;
  /** Current document being processed (if applicable). */
  document?: string;
}

/** Result returned after a full pipeline run. */
export interface PipelineResult {
  /** Total documents loaded from source. */
  documentsIngested: number;
  /** Total chunks produced by the transform stage. */
  chunksCreated: number;
  /** Total chunks successfully embedded. */
  chunksEmbedded: number;
  /** Total chunks written to the output adapter. */
  chunksIndexed: number;
  /** Errors encountered during processing (pipeline continues past these). */
  errors: PipelineError[];
  /** Wall-clock duration of the full pipeline run in milliseconds. */
  durationMs: number;
}

/** A non-fatal error captured during pipeline execution. */
export interface PipelineError {
  /** Pipeline stage where the error occurred. */
  stage: "ingest" | "transform" | "embed" | "index";
  /** Identifier of the document or chunk that failed. */
  itemId: string;
  /** Error message. */
  message: string;
}
