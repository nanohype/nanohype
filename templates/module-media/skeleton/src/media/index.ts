// ── Module Media -- Main Exports ──────────────────────────────────
//
// Public API for the media module. Imports all providers to trigger
// self-registration, then exposes createMediaClient as the primary
// entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { MediaClientConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import { mediaUploadTotal, mediaTransformTotal, mediaDurationMs } from "./metrics.js";
import type { MediaProvider } from "./providers/types.js";
import type {
  MediaAsset,
  UploadOptions,
  TransformOptions,
  DeliveryUrl,
  ListOptions,
  ListResult,
  MediaConfig,
} from "./types.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { MediaProvider, MediaProviderFactory } from "./providers/types.js";
export type {
  MediaAsset,
  UploadOptions,
  TransformOptions,
  TransformPreset,
  DeliveryUrl,
  ListOptions,
  ListResult,
  MediaConfig,
  FitMode,
  MediaFormat,
} from "./types.js";
export { TransformBuilder } from "./transforms/builder.js";
export {
  thumbnail,
  avatar,
  hero,
  ogImage,
  responsive,
  RESPONSIVE_WIDTHS,
  PRESETS,
  getPreset,
  listPresets,
} from "./transforms/presets.js";
export { getResponsiveSrcSet } from "./providers/imgix.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
export { MediaClientConfigSchema } from "./config.js";
export type { MediaClientConfig } from "./config.js";

// ── Media Client Facade ──────────────────────────────────────────

export interface MediaClient {
  /** The underlying provider instance. */
  provider: MediaProvider;

  /** Upload a media asset. */
  upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset>;

  /** Get a delivery URL for an asset with optional transforms. */
  getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl;

  /** Delete an asset by ID. */
  delete(assetId: string): Promise<void>;

  /** List assets with optional pagination. */
  list(options?: ListOptions): Promise<ListResult>;

  /** Shut down the client and release resources. */
  close(): Promise<void>;
}

/** Zod schema for validating createMediaClient arguments. */
const CreateMediaClientSchema = z.object({
  providerName: z.string().min(1, "providerName must be a non-empty string"),
  config: z.record(z.unknown()).default({}),
});

/**
 * Create a configured media client backed by the named provider.
 *
 * The provider must already be registered (built-in providers
 * self-register on import via the providers barrel).
 *
 *   const client = await createMediaClient("cloudinary", {
 *     cloudName: "my-cloud",
 *     apiKey: "xxx",
 *     apiSecret: "yyy",
 *   });
 *
 *   const asset = await client.upload(buffer, { filename: "hero.png" });
 *   const url = client.getUrl(asset.id, { width: 800, format: "webp" });
 */
export async function createMediaClient(
  providerName: string = "mock",
  config: MediaConfig = {},
): Promise<MediaClient> {
  const parsed = CreateMediaClientSchema.safeParse({ providerName, config });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid media config: ${issues}`);
  }

  validateBootstrap();

  const provider = getProvider(providerName);
  await provider.init(config);

  return {
    provider,

    async upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset> {
      const start = performance.now();
      const asset = await provider.upload(data, options);
      const durationMs = performance.now() - start;

      mediaUploadTotal.add(1, { provider: providerName });
      mediaDurationMs.record(durationMs, { operation: "upload" });

      return asset;
    },

    getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl {
      if (transforms) {
        mediaTransformTotal.add(1, { provider: providerName });
      }
      return provider.getUrl(assetId, transforms);
    },

    async delete(assetId: string): Promise<void> {
      const start = performance.now();
      await provider.delete(assetId);
      mediaDurationMs.record(performance.now() - start, { operation: "delete" });
    },

    async list(options?: ListOptions): Promise<ListResult> {
      const start = performance.now();
      const result = await provider.list(options);
      mediaDurationMs.record(performance.now() - start, { operation: "list" });
      return result;
    },

    async close(): Promise<void> {
      await provider.close();
    },
  };
}
