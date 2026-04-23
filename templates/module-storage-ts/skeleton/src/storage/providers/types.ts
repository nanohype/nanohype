// -- StorageProvider Interface --------------------------------------------
//
// All storage backends implement this interface. The registry pattern
// allows new providers to be added by importing a provider module that
// calls registerProvider() at the module level.
//

import type {
  ListOptions,
  ListResult,
  StorageObject,
  UploadData,
  UploadOptions,
} from "../types.js";

/** Configuration passed to a provider on initialization. */
export interface ProviderConfig {
  /** Provider-specific configuration values. */
  [key: string]: unknown;
}

export interface StorageProvider {
  /** Unique provider name (e.g. "local", "s3", "r2", "gcs"). */
  readonly name: string;

  /** Initialize the provider with backend-specific configuration. */
  init(config: ProviderConfig): Promise<void>;

  /** Upload data to the given key. */
  upload(key: string, data: UploadData, opts?: UploadOptions): Promise<void>;

  /** Download the object at the given key as a Buffer. */
  download(key: string): Promise<Buffer>;

  /** Delete the object at the given key. */
  delete(key: string): Promise<void>;

  /** List objects matching the optional prefix. */
  list(prefix?: string, opts?: ListOptions): Promise<ListResult>;

  /**
   * Generate a time-limited signed URL for direct access to an object.
   * @param key     Object key.
   * @param expiresIn  Lifetime in seconds (default provider-specific).
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
