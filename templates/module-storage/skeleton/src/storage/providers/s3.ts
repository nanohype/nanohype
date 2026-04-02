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

// -- AWS S3 Provider -----------------------------------------------------
//
// Standard AWS S3 provider. Uses the official @aws-sdk/client-s3
// package. Credentials are resolved via the default AWS credential
// chain (environment variables, shared config, IAM role, etc.).
//

interface S3Config extends ProviderConfig {
  /** S3 bucket name. Required. */
  bucket: string;

  /** AWS region. Defaults to us-east-1. */
  region?: string;

  /** Optional custom endpoint (used by the R2 provider). */
  endpoint?: string;

  /** Force path-style access (required for some S3-compatible services). */
  forcePathStyle?: boolean;
}

class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client!: S3Client;
  private bucket!: string;

  async init(config: S3Config): Promise<void> {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region ?? "us-east-1",
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle
        ? { forcePathStyle: config.forcePathStyle }
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

    // Body is a Readable stream in Node.js
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
registerProvider(new S3StorageProvider());
