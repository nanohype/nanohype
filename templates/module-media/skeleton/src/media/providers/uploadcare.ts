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

// ── Uploadcare Provider ──────────────────────────────────────────
//
// Uses the Uploadcare REST API for uploads and CDN delivery with
// on-the-fly transforms via URL operations. Auth uses public key
// + secret key. Supports format conversion, resize, and quality.
//
// Each factory call returns an independent instance with its own
// API client state and circuit breaker.
//

interface UploadcareConfig {
  publicKey: string;
  secretKey: string;
}

const FIT_MAP: Record<string, string> = {
  cover: "crop",
  contain: "fit",
  fill: "stretch",
  scale: "scale",
};

function createUploadcareProvider(): MediaProvider {
  let config: UploadcareConfig | null = null;
  const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });
  const assets = new Map<string, MediaAsset>();

  function requireConfig(): UploadcareConfig {
    if (!config) throw new Error("Uploadcare provider not initialized -- call init() first");
    return config;
  }

  function buildAuthHeader(method: string, contentType: string, contentMd5: string, uri: string, date: string, secretKey: string): string {
    const signString = [method, contentMd5, contentType, date, uri].join("\n");
    return createHmac("sha1", secretKey).update(signString).digest("hex");
  }

  return {
    name: "uploadcare",

    async init(cfg: MediaConfig): Promise<void> {
      const publicKey = (cfg.publicKey as string) || process.env.UPLOADCARE_PUBLIC_KEY;
      const secretKey = (cfg.secretKey as string) || process.env.UPLOADCARE_SECRET_KEY;

      if (!publicKey || !secretKey) {
        throw new Error(
          "Uploadcare requires publicKey and secretKey " +
          "(via config or UPLOADCARE_PUBLIC_KEY, UPLOADCARE_SECRET_KEY env vars)",
        );
      }

      config = { publicKey, secretKey };
      logger.info("Uploadcare provider initialized");
    },

    async upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset> {
      const { publicKey } = requireConfig();

      const formData = new FormData();
      formData.append("UPLOADCARE_PUB_KEY", publicKey);
      formData.append("UPLOADCARE_STORE", "auto");
      formData.append("file", new Blob([data]), options?.filename ?? "upload");
      if (options?.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          formData.append(`metadata[${key}]`, value);
        }
      }

      const response = await breaker.execute(async () => {
        const res = await fetch("https://upload.uploadcare.com/base/", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare upload failed (${res.status}): ${text}`);
        }
        return res.json();
      });

      const uuid = response.file;

      // Fetch file info for dimensions
      const { publicKey: pk, secretKey } = requireConfig();
      const date = new Date().toUTCString();
      const uri = `/files/${uuid}/`;
      const signature = buildAuthHeader("GET", "application/json", "", uri, date, secretKey);

      const info = await breaker.execute(async () => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          headers: {
            "Content-Type": "application/json",
            Date: date,
            Authorization: `Uploadcare ${pk}:${signature}`,
          },
        });
        if (!res.ok) return {};
        return res.json();
      });

      const asset: MediaAsset = {
        id: uuid,
        filename: info.original_filename ?? options?.filename,
        contentType: info.mime_type,
        size: info.size,
        width: info.image_info?.width,
        height: info.image_info?.height,
        createdAt: info.datetime_uploaded ? new Date(info.datetime_uploaded) : new Date(),
      };

      assets.set(uuid, asset);
      return asset;
    },

    getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl {
      let url = `https://ucarecdn.com/${assetId}/`;

      if (transforms) {
        const ops: string[] = [];
        if (transforms.width && transforms.height) {
          const mode = transforms.fit ? FIT_MAP[transforms.fit] ?? "crop" : "crop";
          if (mode === "crop") {
            ops.push(`-/scale_crop/${transforms.width}x${transforms.height}/center`);
          } else if (mode === "stretch") {
            ops.push(`-/stretch/on`);
            ops.push(`-/resize/${transforms.width}x${transforms.height}`);
          } else {
            ops.push(`-/resize/${transforms.width}x${transforms.height}`);
          }
        } else if (transforms.width) {
          ops.push(`-/resize/${transforms.width}x`);
        } else if (transforms.height) {
          ops.push(`-/resize/x${transforms.height}`);
        }
        if (transforms.format && transforms.format !== "auto") {
          ops.push(`-/format/${transforms.format}`);
        }
        if (transforms.format === "auto") {
          ops.push("-/format/auto");
        }
        if (transforms.quality) {
          ops.push(`-/quality/lightest`);
        }
        url += ops.join("/") + "/";
      }

      return {
        url,
        width: transforms?.width,
        height: transforms?.height,
        format: transforms?.format,
      };
    },

    async delete(assetId: string): Promise<void> {
      const { publicKey, secretKey } = requireConfig();
      const date = new Date().toUTCString();
      const uri = `/files/${assetId}/`;
      const signature = buildAuthHeader("DELETE", "application/json", "", uri, date, secretKey);

      await breaker.execute(async () => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Date: date,
            Authorization: `Uploadcare ${publicKey}:${signature}`,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare delete failed (${res.status}): ${text}`);
        }
      });

      assets.delete(assetId);
    },

    async list(options?: ListOptions): Promise<ListResult> {
      const { publicKey, secretKey } = requireConfig();
      const date = new Date().toUTCString();
      const params = new URLSearchParams();
      if (options?.maxResults) params.set("limit", options.maxResults.toString());
      if (options?.cursor) params.set("offset", options.cursor);

      const uri = `/files/?${params}`;
      const signature = buildAuthHeader("GET", "application/json", "", uri, date, secretKey);

      const response = await breaker.execute(async () => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          headers: {
            "Content-Type": "application/json",
            Date: date,
            Authorization: `Uploadcare ${publicKey}:${signature}`,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare list failed (${res.status}): ${text}`);
        }
        return res.json();
      });

      const resultAssets: MediaAsset[] = (response.results ?? []).map((r: Record<string, unknown>) => ({
        id: r.uuid as string,
        filename: r.original_filename as string,
        contentType: r.mime_type as string,
        size: r.size as number,
        createdAt: r.datetime_uploaded ? new Date(r.datetime_uploaded as string) : undefined,
      }));

      return {
        assets: resultAssets,
        nextCursor: response.next ? String((response.results?.length ?? 0)) : undefined,
      };
    },

    async close(): Promise<void> {
      config = null;
      assets.clear();
    },
  };
}

// Self-register factory
registerProvider("uploadcare", createUploadcareProvider);
