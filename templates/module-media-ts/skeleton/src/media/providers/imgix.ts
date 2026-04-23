import { createHmac } from "node:crypto";
import type { MediaProvider } from "./types.js";
import type {
  MediaAsset,
  UploadOptions,
  TransformOptions,
  DeliveryUrl,
  ListOptions,
  ListResult,
  MediaConfig,
} from "../types.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { logger } from "../logger.js";
import { registerProvider } from "./registry.js";

// ── imgix Provider ───────────────────────────────────────────────
//
// URL-based transforms only -- imgix does not handle uploads. Assets
// must already exist in the configured imgix source (S3, GCS, web
// folder, etc.). Signs URLs with a secure token and generates srcset
// strings for responsive images.
//
// Each factory call returns an independent instance with its own
// configuration and circuit breaker.
//

interface ImgixConfig {
  source: string;
  token: string;
}

const FIT_MAP: Record<string, string> = {
  cover: "crop",
  contain: "clip",
  fill: "fill",
  scale: "scale",
};

/** Default responsive widths for srcset generation. */
const DEFAULT_SRCSET_WIDTHS = [320, 640, 960, 1280, 1920];

function createImgixProvider(): MediaProvider {
  let config: ImgixConfig | null = null;
  const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });

  function requireConfig(): ImgixConfig {
    if (!config) throw new Error("imgix provider not initialized -- call init() first");
    return config;
  }

  function signUrl(path: string, token: string): string {
    const signature = createHmac("md5", token).update(path).digest("hex");
    return signature;
  }

  function buildUrl(assetPath: string, transforms?: TransformOptions): string {
    const { source, token } = requireConfig();
    const params = new URLSearchParams();

    if (transforms) {
      if (transforms.width) params.set("w", transforms.width.toString());
      if (transforms.height) params.set("h", transforms.height.toString());
      if (transforms.fit) params.set("fit", FIT_MAP[transforms.fit] ?? "crop");
      if (transforms.format && transforms.format !== "auto") params.set("fm", transforms.format);
      if (transforms.format === "auto") params.set("auto", "format");
      if (transforms.quality) params.set("q", transforms.quality.toString());
    }

    const queryString = params.toString();
    const pathWithQuery = queryString ? `/${assetPath}?${queryString}` : `/${assetPath}`;
    const sig = signUrl(pathWithQuery, token);
    const separator = queryString ? "&" : "?";

    return `https://${source}.imgix.net${pathWithQuery}${separator}s=${sig}`;
  }

  return {
    name: "imgix",

    async init(cfg: MediaConfig): Promise<void> {
      const source = (cfg.source as string) || process.env.IMGIX_SOURCE;
      const token = (cfg.token as string) || process.env.IMGIX_TOKEN;

      if (!source || !token) {
        throw new Error(
          "imgix requires source and token " +
          "(via config or IMGIX_SOURCE, IMGIX_TOKEN env vars)",
        );
      }

      config = { source, token };
      logger.info("imgix provider initialized", { source });
    },

    async upload(_data: Buffer | Uint8Array, _options?: UploadOptions): Promise<MediaAsset> {
      throw new Error(
        "imgix does not support uploads -- assets must already exist in the configured source. " +
        "Use module-storage or another provider for uploads, then reference by path.",
      );
    },

    getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl {
      return {
        url: buildUrl(assetId, transforms),
        width: transforms?.width,
        height: transforms?.height,
        format: transforms?.format,
      };
    },

    async delete(_assetId: string): Promise<void> {
      throw new Error(
        "imgix does not support deletes -- manage source assets directly via your storage backend.",
      );
    },

    async list(_options?: ListOptions): Promise<ListResult> {
      throw new Error(
        "imgix does not support listing -- query your storage backend directly.",
      );
    },

    async close(): Promise<void> {
      config = null;
    },
  };
}

/**
 * Generate a responsive srcset string for an imgix asset.
 *
 * Returns a string suitable for the `srcset` HTML attribute:
 *   `<url> 320w, <url> 640w, ...`
 *
 * @param source - imgix source subdomain
 * @param token - imgix secure token
 * @param assetPath - Path to the asset in the imgix source
 * @param widths - Array of pixel widths (defaults to [320, 640, 960, 1280, 1920])
 * @param baseTransforms - Additional transform options applied to each width variant
 */
export function getResponsiveSrcSet(
  source: string,
  token: string,
  assetPath: string,
  widths: number[] = DEFAULT_SRCSET_WIDTHS,
  baseTransforms?: Omit<TransformOptions, "width">,
): string {
  return widths
    .map((w) => {
      const params = new URLSearchParams();
      params.set("w", w.toString());
      if (baseTransforms?.height) params.set("h", baseTransforms.height.toString());
      if (baseTransforms?.fit) params.set("fit", FIT_MAP[baseTransforms.fit] ?? "crop");
      if (baseTransforms?.format && baseTransforms.format !== "auto") params.set("fm", baseTransforms.format);
      if (baseTransforms?.format === "auto") params.set("auto", "format");
      if (baseTransforms?.quality) params.set("q", baseTransforms.quality.toString());

      const queryString = params.toString();
      const pathWithQuery = `/${assetPath}?${queryString}`;
      const sig = createHmac("md5", token).update(pathWithQuery).digest("hex");

      return `https://${source}.imgix.net${pathWithQuery}&s=${sig} ${w}w`;
    })
    .join(", ");
}

// Self-register factory
registerProvider("imgix", createImgixProvider);
