import { createHash, createHmac } from "node:crypto";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import type {
  DeliveryUrl,
  ListOptions,
  ListResult,
  MediaAsset,
  MediaConfig,
  TransformOptions,
  UploadOptions,
} from "../types.js";
import { registerProvider } from "./registry.js";
import type { MediaProvider } from "./types.js";

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

interface UploadcareUploadResponse {
  file: string;
}

interface UploadcareFileInfo {
  original_filename?: string;
  mime_type?: string;
  size?: number;
  image_info?: { width?: number; height?: number };
  datetime_uploaded?: string;
}

interface UploadcareListResponse {
  results?: Record<string, unknown>[];
  next?: string | null;
}

const FIT_MAP: Record<string, string> = {
  cover: "crop",
  contain: "fit",
  fill: "stretch",
  scale: "scale",
};

/** The REST API version the spec requires on every request, via `Accept`. */
const REST_API_VERSION = "application/vnd.uploadcare-v0.7+json";

/**
 * MD5 of an empty request body — the `contentMd5` component for any bodyless
 * call. Computed rather than pasted so it is verifiable at a glance.
 */
const EMPTY_BODY_MD5 = createHash("md5").update("").digest("hex");

function createUploadcareProvider(): MediaProvider {
  let config: UploadcareConfig | null = null;
  const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });
  const assets = new Map<string, MediaAsset>();

  function requireConfig(): UploadcareConfig {
    if (!config) throw new Error("Uploadcare provider not initialized -- call init() first");
    return config;
  }

  /**
   * Every header the signed REST scheme requires, for a request with no body.
   *
   * Returns the whole header set rather than just the signature because three of
   * the four parts are load-bearing and easy to omit one at a time: the `Date`
   * that was signed has to be the `Date` that is sent (the server rejects a skew
   * over 15 minutes), the `Content-Type` is inside the signed string, and
   * `Accept` pins the API version, which the spec requires on every request.
   *
   * `contentMd5` is the MD5 of the request body, and for a bodyless request that
   * is the MD5 of the empty string — not the empty string. Passing "" produces a
   * signature over a different string than the server computes, so every call
   * comes back 401 with nothing to indicate which of the five components was
   * wrong. A request that does carry a body needs the body's own digest here.
   *
   * On SHA-1: the algorithm is fixed by Uploadcare's protocol — the server
   * validates HMAC-SHA1 and nothing else, so this is not a choice the client
   * gets to make. A static analyser will flag it as a weak hash, and for a
   * *digest* that would be right; for an HMAC it is not. HMAC's security rests
   * on the PRF property of the compression function, not on collision
   * resistance, so the SHAttered-class attacks on SHA-1 do not carry over.
   * HMAC-SHA1 has no practical break and remains acceptable for authentication.
   * (Contrast the Cloudinary provider, which signs a bare digest and therefore
   * uses SHA-256 — there the vendor accepts both and the stronger hash is free.)
   *
   * https://uploadcare.com/docs/api/rest/authentication/
   */
  function signedHeaders(method: string, uri: string): Record<string, string> {
    const { publicKey, secretKey } = requireConfig();
    const date = new Date().toUTCString();
    const contentType = "application/json";
    const signString = [method, EMPTY_BODY_MD5, contentType, date, uri].join("\n");
    const signature = createHmac("sha1", secretKey).update(signString).digest("hex");
    return {
      "Content-Type": contentType,
      Accept: REST_API_VERSION,
      Date: date,
      Authorization: `Uploadcare ${publicKey}:${signature}`,
    };
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

      const response = await breaker.execute(async (): Promise<UploadcareUploadResponse> => {
        const res = await fetch("https://upload.uploadcare.com/base/", {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          body: formData,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare upload failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<UploadcareUploadResponse>;
      });

      const uuid = response.file;

      // Fetch file info for dimensions
      const uri = `/files/${uuid}/`;

      const info = await breaker.execute(async (): Promise<UploadcareFileInfo> => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          signal: AbortSignal.timeout(30_000),
          headers: signedHeaders("GET", uri),
        });
        if (!res.ok) return {};
        return res.json() as Promise<UploadcareFileInfo>;
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
          const mode = transforms.fit ? (FIT_MAP[transforms.fit] ?? "crop") : "crop";
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
      const uri = `/files/${assetId}/`;

      await breaker.execute(async () => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(30_000),
          headers: signedHeaders("DELETE", uri),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare delete failed (${res.status}): ${text}`);
        }
      });

      assets.delete(assetId);
    },

    async list(options?: ListOptions): Promise<ListResult> {
      const params = new URLSearchParams();
      if (options?.maxResults) params.set("limit", options.maxResults.toString());
      if (options?.cursor) params.set("offset", options.cursor);

      const uri = `/files/?${params}`;

      const response = await breaker.execute(async (): Promise<UploadcareListResponse> => {
        const res = await fetch(`https://api.uploadcare.com${uri}`, {
          signal: AbortSignal.timeout(30_000),
          headers: signedHeaders("GET", uri),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Uploadcare list failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<UploadcareListResponse>;
      });

      const resultAssets: MediaAsset[] = (response.results ?? []).map(
        (r: Record<string, unknown>) => ({
          id: r.uuid as string,
          filename: r.original_filename as string,
          contentType: r.mime_type as string,
          size: r.size as number,
          createdAt: r.datetime_uploaded ? new Date(r.datetime_uploaded as string) : undefined,
        }),
      );

      return {
        assets: resultAssets,
        nextCursor: response.next ? String(response.results?.length ?? 0) : undefined,
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
