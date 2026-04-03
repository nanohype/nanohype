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
import { registerProvider } from "./registry.js";

// ── Mock Provider ────────────────────────────────────────────────
//
// In-memory media provider with fake URLs. Stores uploads in a Map
// keyed by ID. getUrl returns mock:// URLs with transform parameters
// baked in. Suitable for development and testing -- no external
// dependencies or API keys required.
//
// Each factory call returns an independent instance with its own
// asset store.
//

function createMockProvider(): MediaProvider {
  const store = new Map<string, MediaAsset & { data: Buffer | Uint8Array }>();
  let idCounter = 0;

  return {
    name: "mock",

    async init(_config: MediaConfig): Promise<void> {
      // No setup needed for in-memory provider
    },

    async upload(data: Buffer | Uint8Array, options?: UploadOptions): Promise<MediaAsset> {
      idCounter++;
      const id = options?.filename ?? `mock-asset-${idCounter}`;

      const asset: MediaAsset = {
        id,
        filename: options?.filename ?? `file-${idCounter}`,
        contentType: options?.contentType ?? "image/png",
        size: data.byteLength,
        width: 800,
        height: 600,
        createdAt: new Date(),
        metadata: options?.metadata ? { ...options.metadata } : undefined,
      };

      store.set(id, { ...asset, data });
      return asset;
    },

    getUrl(assetId: string, transforms?: TransformOptions): DeliveryUrl {
      const params = new URLSearchParams();
      if (transforms?.width) params.set("w", transforms.width.toString());
      if (transforms?.height) params.set("h", transforms.height.toString());
      if (transforms?.fit) params.set("fit", transforms.fit);
      if (transforms?.format) params.set("fm", transforms.format);
      if (transforms?.quality) params.set("q", transforms.quality.toString());

      const query = params.toString();
      const url = `mock://media/${assetId}${query ? `?${query}` : ""}`;

      return {
        url,
        width: transforms?.width,
        height: transforms?.height,
        format: transforms?.format,
      };
    },

    async delete(assetId: string): Promise<void> {
      store.delete(assetId);
    },

    async list(options?: ListOptions): Promise<ListResult> {
      let entries = Array.from(store.values()).map(({ data: _data, ...asset }) => asset);

      if (options?.folder) {
        entries = entries.filter((a) => a.id.startsWith(options.folder!));
      }

      const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;
      const limit = options?.maxResults ?? 20;
      const page = entries.slice(offset, offset + limit);
      const nextOffset = offset + limit;

      return {
        assets: page,
        nextCursor: nextOffset < entries.length ? nextOffset.toString() : undefined,
      };
    },

    async close(): Promise<void> {
      store.clear();
      idCounter = 0;
    },
  };
}

// Self-register factory
registerProvider("mock", createMockProvider);
