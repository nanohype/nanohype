// ── Media Core Types ──────────────────────────────────────────────
//
// Shared interfaces for media assets, uploads, transforms, and
// delivery. These are provider-agnostic -- every backend works
// against the same shapes.
//

export type { MediaProvider, MediaProviderFactory } from "./providers/types.js";

/** How an image should be fitted into the target dimensions. */
export type FitMode = "cover" | "contain" | "fill" | "scale";

/** Supported output formats for media transforms. */
export type MediaFormat = "webp" | "avif" | "jpeg" | "png" | "auto";

/** Transform parameters applied when generating a delivery URL. */
export interface TransformOptions {
  /** Target width in pixels. */
  width?: number;

  /** Target height in pixels. */
  height?: number;

  /** How the image fits the target dimensions. */
  fit?: FitMode;

  /** Output format. */
  format?: MediaFormat;

  /** Quality level (1-100). */
  quality?: number;
}

/** Named transform preset with a human-readable label. */
export interface TransformPreset {
  /** Preset name (e.g. "thumbnail", "avatar"). */
  name: string;

  /** Human-readable label. */
  label: string;

  /** Transform options this preset produces. */
  options: TransformOptions;
}

/** Metadata about an uploaded media asset. */
export interface MediaAsset {
  /** Unique asset identifier assigned by the provider. */
  id: string;

  /** Original filename, when known. */
  filename?: string;

  /** MIME content type. */
  contentType?: string;

  /** File size in bytes. */
  size?: number;

  /** Pixel width of the original asset. */
  width?: number;

  /** Pixel height of the original asset. */
  height?: number;

  /** Upload timestamp. */
  createdAt?: Date;

  /** Provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Options passed to upload operations. */
export interface UploadOptions {
  /** Desired filename or public ID for the asset. */
  filename?: string;

  /** MIME content type override. */
  contentType?: string;

  /** Folder/path prefix in the provider. */
  folder?: string;

  /** Arbitrary key-value metadata stored alongside the asset. */
  metadata?: Record<string, string>;

  /** Eager transforms to apply on upload (provider-specific). */
  eagerTransforms?: TransformOptions[];
}

/** A fully-qualified delivery URL with optional metadata. */
export interface DeliveryUrl {
  /** The complete URL for embedding or linking. */
  url: string;

  /** Width of the transformed image, when known. */
  width?: number;

  /** Height of the transformed image, when known. */
  height?: number;

  /** Format of the delivered image. */
  format?: MediaFormat;
}

/** Result of a paginated list operation. */
export interface ListResult {
  /** Assets in this page. */
  assets: MediaAsset[];

  /** When present, pass this value as `cursor` to fetch the next page. */
  nextCursor?: string;
}

/** Options for listing assets. */
export interface ListOptions {
  /** Maximum number of assets to return. */
  maxResults?: number;

  /** Continuation token for paginated results. */
  cursor?: string;

  /** Filter to a specific folder/prefix. */
  folder?: string;
}

/** Configuration passed to createMediaClient. */
export interface MediaConfig {
  /** Provider-specific configuration values. */
  [key: string]: unknown;
}
