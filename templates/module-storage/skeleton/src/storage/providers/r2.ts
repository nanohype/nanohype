import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
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
import { toBuffer, withRetry } from "./helpers.js";

// -- Cloudflare R2 Provider ----------------------------------------------
//
// R2 is S3-compatible, so this provider uses the same @aws-sdk/client-s3
// package with a custom endpoint pointing to the R2 API. The endpoint
// is derived from the Cloudflare account ID.
//

interface R2Config extends ProviderConfig {
  /** R2 bucket name. Required. */
  bucket: string;

  /** Cloudflare account ID. Required. */
  accountId: string;

  /** R2 access key ID. */
  accessKeyId?: string;

  /** R2 secret access key. */
  secretAccessKey?: string;
}

class R2StorageProvider implements StorageProvider {
  readonly name = "r2";
  private client!: S3Client;
  private bucket!: string;

  async init(config: R2Config): Promise<void> {
    this.bucket = config.bucket;

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async upload(
    key: string,
    data: UploadData,
    opts?: UploadOptions
  ): Promise<void> {
    const body = await toBuffer(data);

    await withRetry(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
          Metadata: opts?.metadata,
        })
      )
    );
  }

  async download(key: string): Promise<Buffer> {
    const response = await withRetry(() =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
    );

    if (!response.Body) {
      throw new Error(`Empty response body for key "${key}"`);
    }

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await withRetry(() =>
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
    );
  }

  async list(prefix?: string, opts?: ListOptions): Promise<ListResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix ?? undefined,
        MaxKeys: opts?.maxKeys,
        ContinuationToken: opts?.cursor,
      })
    );

    const objects: StorageObject[] = (response.Contents ?? []).map((item) => ({
      key: item.Key!,
      size: item.Size,
      lastModified: item.LastModified,
      etag: item.ETag,
    }));

    return {
      objects,
      nextCursor: response.NextContinuationToken,
    };
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return awsGetSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? 3600,
    });
  }

}

// Self-register
registerProvider(new R2StorageProvider());
