import { Storage } from "@google-cloud/storage";
import { Readable } from "node:stream";

import type {
  ListOptions,
  ListResult,
  StorageObject,
  UploadData,
  UploadOptions,
} from "../types.js";
import type { ProviderConfig, StorageProvider } from "./types.js";
import { registerProvider } from "./registry.js";

// -- Google Cloud Storage Provider ---------------------------------------
//
// Wraps the official @google-cloud/storage client. Credentials are
// resolved via Application Default Credentials (ADC) — environment
// variable GOOGLE_APPLICATION_CREDENTIALS, gcloud CLI auth, or
// metadata server on GCE/Cloud Run.
//

interface GcsConfig extends ProviderConfig {
  /** GCS bucket name. Required. */
  bucket: string;

  /** GCP project ID. Optional if resolvable from environment. */
  projectId?: string;

  /** Path to a service account key file. Optional if using ADC. */
  keyFilename?: string;
}

class GcsStorageProvider implements StorageProvider {
  readonly name = "gcs";
  private storage!: Storage;
  private bucketName!: string;

  async init(config: GcsConfig): Promise<void> {
    this.bucketName = config.bucket;
    this.storage = new Storage({
      ...(config.projectId ? { projectId: config.projectId } : {}),
      ...(config.keyFilename ? { keyFilename: config.keyFilename } : {}),
    });
  }

  async upload(
    key: string,
    data: UploadData,
    opts?: UploadOptions
  ): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);
    const buffer = await this.toBuffer(data);

    await file.save(buffer, {
      contentType: opts?.contentType,
      metadata: opts?.metadata ? { metadata: opts.metadata } : undefined,
    });
  }

  async download(key: string): Promise<Buffer> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);
    const [contents] = await file.download();
    return contents;
  }

  async delete(key: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);
    await file.delete({ ignoreNotFound: true });
  }

  async list(prefix?: string, opts?: ListOptions): Promise<ListResult> {
    const bucket = this.storage.bucket(this.bucketName);

    const [files, , apiResponse] = await bucket.getFiles({
      prefix: prefix ?? undefined,
      maxResults: opts?.maxKeys,
      pageToken: opts?.cursor,
    });

    const objects: StorageObject[] = files.map((file) => ({
      key: file.name,
      size: file.metadata.size ? Number(file.metadata.size) : undefined,
      contentType: file.metadata.contentType ?? undefined,
      lastModified: file.metadata.updated
        ? new Date(file.metadata.updated)
        : undefined,
      etag: file.metadata.etag ?? undefined,
    }));

    return {
      objects,
      nextCursor: apiResponse?.nextPageToken,
    };
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + (expiresIn ?? 3600) * 1000,
    });

    return url;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async toBuffer(data: UploadData): Promise<Buffer> {
    if (Buffer.isBuffer(data)) return data;
    if (typeof data === "string") return Buffer.from(data, "utf-8");
    if (data instanceof Uint8Array) return Buffer.from(data);

    const chunks: Buffer[] = [];
    for await (const chunk of data as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

// Self-register
registerProvider(new GcsStorageProvider());
