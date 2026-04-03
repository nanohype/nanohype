// ── Media Provider Interface ──────────────────────────────────────
//
// All media providers implement this interface. The registry stores
// provider factories -- each call to getProvider() returns a fresh
// instance with its own circuit breaker and API client state.
//
// No module-level mutable state: API clients are lazily initialized
// inside each factory closure, and circuit breakers are per-instance.
//

import type {
  MediaAsset,
  UploadOptions,
  TransformOptions,
  DeliveryUrl,
  ListOptions,
  ListResult,
  MediaConfig,
} from "../types.js";

/** Provider factory -- returns a new MediaProvider instance each time. */
export type MediaProviderFactory = () => MediaProvider;

export interface MediaProvider {
  /** Unique provider name (e.g. "cloudinary", "uploadcare", "imgix"). */
  readonly name: string;

  /** Initialize the provider with configuration. */
  init(config: MediaConfig): Promise<void>;

  /** Upload a media asset. Returns metadata about the stored asset. */
  upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset>;

  /** Get a delivery URL for an asset, optionally with transforms applied. */
  getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl;

  /** Delete an asset by ID. */
  delete(assetId: string): Promise<void>;

  /** List assets with optional pagination. */
  list(options?: ListOptions): Promise<ListResult>;

  /** Gracefully shut down the provider, releasing resources. */
  close(): Promise<void>;
}
