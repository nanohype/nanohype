import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import type {
  ListOptions,
  ListResult,
  StorageObject,
  UploadData,
  UploadOptions,
} from "./types.js";
import type { ProviderConfig, StorageProvider } from "./providers/types.js";
import { getProvider } from "./providers/registry.js";

// -- Storage Client ------------------------------------------------------
//
// High-level client that wraps a StorageProvider. Provides the same
// operations as the provider interface with a cleaner construction
// pattern — call createStorageClient() with a provider name and
// config, and get back an initialized client ready for use.
//

export class StorageClient {
  private provider: StorageProvider;

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  /** The name of the underlying storage provider. */
  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Upload data to the given key.
   * Accepts Buffer, Uint8Array, string, or a Node.js Readable stream.
   */
  async upload(
    key: string,
    data: UploadData,
    opts?: UploadOptions
  ): Promise<void> {
    return this.provider.upload(key, data, opts);
  }

  /** Download the object at the given key as a Buffer. */
  async download(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  /** Delete the object at the given key. */
  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  /** List objects matching the optional prefix. */
  async list(prefix?: string, opts?: ListOptions): Promise<ListResult> {
    return this.provider.list(prefix, opts);
  }

  /** Generate a time-limited signed URL for direct access to an object. */
  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    return this.provider.getSignedUrl(key, expiresIn);
  }
}

/** Zod schema for validating createStorageClient arguments. */
const CreateStorageClientSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.object({
    bucket: z.string().optional(),
    region: z.string().optional(),
    basePath: z.string().optional(),
  }).passthrough(),
});

/**
 * Create and initialize a storage client for the named provider.
 *
 * @param providerName  Provider identifier (e.g. "local", "s3", "r2", "gcs").
 * @param config        Provider-specific configuration.
 * @returns             An initialized StorageClient.
 */
export async function createStorageClient(
  providerName: string,
  config: ProviderConfig = {}
): Promise<StorageClient> {
  const parsed = CreateStorageClientSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid storage config: ${issues}`);
  }

  validateBootstrap();

  // Ensure all built-in providers are registered
  await import("./providers/index.js");

  const provider = getProvider(providerName);
  await provider.init(config);
  return new StorageClient(provider);
}
