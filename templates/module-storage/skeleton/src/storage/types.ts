// -- Storage Types -------------------------------------------------------
//
// Core types used across the storage module. The StorageProvider
// interface is re-exported from providers/types.ts for convenience.
// This file defines the data structures that flow through the system.
//

import type { Readable } from "node:stream";

export type { StorageProvider } from "./providers/types.js";

/** Metadata about a stored object. */
export interface StorageObject {
  /** Object key (path) within the storage backend. */
  key: string;

  /** Size in bytes, when known. */
  size?: number;

  /** MIME content type, when known. */
  contentType?: string;

  /** Last modification timestamp. */
  lastModified?: Date;

  /** Provider-specific ETag or version identifier. */
  etag?: string;
}

/** Options passed to upload operations. */
export interface UploadOptions {
  /** MIME content type for the object. */
  contentType?: string;

  /** Arbitrary key-value metadata stored alongside the object. */
  metadata?: Record<string, string>;
}

/** Options passed to list operations. */
export interface ListOptions {
  /** Maximum number of objects to return. */
  maxKeys?: number;

  /** Continuation token for paginated results. */
  cursor?: string;
}

/** Result of a paginated list operation. */
export interface ListResult {
  objects: StorageObject[];

  /** When present, pass this value as `cursor` to fetch the next page. */
  nextCursor?: string;
}

/** Data that can be uploaded to a storage provider. */
export type UploadData = Buffer | Uint8Array | Readable | string;
