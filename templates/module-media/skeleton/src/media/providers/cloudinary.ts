import { createHash, createHmac } from "node:crypto";
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

// ── Cloudinary Provider ──────────────────────────────────────────
//
// Uses the Cloudinary Upload API for uploads and URL-based transforms
// for delivery. Authentication uses API key + secret with SHA-1
// signature generation. Supports eager transforms, format conversion,
// and quality auto.
//
// Each factory call returns an independent instance with its own
// API client state and circuit breaker.
//

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const FIT_MAP: Record<string, string> = {
  cover: "c_fill",
  contain: "c_fit",
  fill: "c_lfill",
  scale: "c_scale",
};

function createCloudinaryProvider(): MediaProvider {
  let config: CloudinaryConfig | null = null;
  const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });

  function requireConfig(): CloudinaryConfig {
    if (!config) throw new Error("Cloudinary provider not initialized -- call init() first");
    return config;
  }

  function generateSignature(params: Record<string, string>, apiSecret: string): string {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha1").update(sorted + apiSecret).digest("hex");
  }

  function buildTransformString(transforms: TransformOptions): string {
    const parts: string[] = [];
    if (transforms.width) parts.push(`w_${transforms.width}`);
    if (transforms.height) parts.push(`h_${transforms.height}`);
    if (transforms.fit) parts.push(FIT_MAP[transforms.fit] ?? "c_fill");
    if (transforms.format && transforms.format !== "auto") parts.push(`f_${transforms.format}`);
    if (transforms.format === "auto") parts.push("f_auto");
    if (transforms.quality) parts.push(`q_${transforms.quality}`);
    return parts.join(",");
  }

  return {
    name: "cloudinary",

    async init(cfg: MediaConfig): Promise<void> {
      const cloudName = (cfg.cloudName as string) || process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = (cfg.apiKey as string) || process.env.CLOUDINARY_API_KEY;
      const apiSecret = (cfg.apiSecret as string) || process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
          "Cloudinary requires cloudName, apiKey, and apiSecret " +
          "(via config or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET env vars)",
        );
      }

      config = { cloudName, apiKey, apiSecret };
      logger.info("Cloudinary provider initialized", { cloudName });
    },

    async upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset> {
      const { cloudName, apiKey, apiSecret } = requireConfig();
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const params: Record<string, string> = { timestamp };
      if (options?.filename) params.public_id = options.filename;
      if (options?.folder) params.folder = options.folder;
      if (options?.eagerTransforms?.length) {
        params.eager = options.eagerTransforms.map((t) => buildTransformString(t)).join("|");
      }

      const signature = generateSignature(params, apiSecret);

      const formData = new FormData();
      formData.append("file", new Blob([data]), options?.filename ?? "upload");
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      for (const [key, value] of Object.entries(params)) {
        if (key !== "timestamp") formData.append(key, value);
      }

      const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

      const response = await breaker.execute(async () => {
        const res = await fetch(url, { method: "POST", body: formData });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Cloudinary upload failed (${res.status}): ${text}`);
        }
        return res.json();
      });

      return {
        id: response.public_id,
        filename: response.original_filename,
        contentType: `image/${response.format}`,
        size: response.bytes,
        width: response.width,
        height: response.height,
        createdAt: new Date(response.created_at),
        metadata: { version: response.version, etag: response.etag },
      };
    },

    getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl {
      const { cloudName } = requireConfig();
      const transformStr = transforms ? buildTransformString(transforms) : "";
      const transformPath = transformStr ? `${transformStr}/` : "";
      const format = transforms?.format && transforms.format !== "auto" ? `.${transforms.format}` : "";
      const url = `https://res.cloudinary.com/${cloudName}/image/upload/${transformPath}${assetId}${format}`;

      return {
        url,
        width: transforms?.width,
        height: transforms?.height,
        format: transforms?.format,
      };
    },

    async delete(assetId: string): Promise<void> {
      const { cloudName, apiKey, apiSecret } = requireConfig();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params: Record<string, string> = { public_id: assetId, timestamp };
      const signature = generateSignature(params, apiSecret);

      const formData = new FormData();
      formData.append("public_id", assetId);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);

      const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;

      await breaker.execute(async () => {
        const res = await fetch(url, { method: "POST", body: formData });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Cloudinary delete failed (${res.status}): ${text}`);
        }
      });
    },

    async list(options?: ListOptions): Promise<ListResult> {
      const { cloudName, apiKey, apiSecret } = requireConfig();
      const params = new URLSearchParams();
      if (options?.maxResults) params.set("max_results", options.maxResults.toString());
      if (options?.cursor) params.set("next_cursor", options.cursor);
      if (options?.folder) params.set("prefix", options.folder);

      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
      const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?${params}`;

      const response = await breaker.execute(async () => {
        const res = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Cloudinary list failed (${res.status}): ${text}`);
        }
        return res.json();
      });

      const assets: MediaAsset[] = (response.resources ?? []).map((r: Record<string, unknown>) => ({
        id: r.public_id as string,
        filename: r.public_id as string,
        contentType: `image/${r.format}`,
        size: r.bytes as number,
        width: r.width as number,
        height: r.height as number,
        createdAt: new Date(r.created_at as string),
      }));

      return {
        assets,
        nextCursor: response.next_cursor ?? undefined,
      };
    },

    async close(): Promise<void> {
      config = null;
    },
  };
}

// Self-register factory
registerProvider("cloudinary", createCloudinaryProvider);
