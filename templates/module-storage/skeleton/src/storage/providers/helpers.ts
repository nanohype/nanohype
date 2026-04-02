import type { Readable } from "node:stream";
import type { UploadData } from "../types.js";

// -- Provider Helpers -------------------------------------------------------
//
// Shared utilities used by cloud storage providers (S3, R2, GCS).
//
// - toBuffer()   Collects UploadData into a Buffer with a configurable
//                size limit to prevent unbounded memory growth.
// - withRetry()  Retries an async operation on transient network errors
//                using exponential backoff with jitter.
//

/** Default maximum buffer size: 100 MB. */
const DEFAULT_MAX_BUFFER_SIZE = 100 * 1024 * 1024;

/**
 * Collect UploadData into a single Buffer.
 *
 * When the input is a Readable stream, chunks are accumulated and the
 * running total is checked against `maxBytes`. If the limit is exceeded
 * the stream is destroyed and an error is thrown.
 *
 * @param data      Buffer, Uint8Array, string, or Readable stream.
 * @param maxBytes  Maximum allowed size in bytes (default 100 MB).
 */
export async function toBuffer(
  data: UploadData,
  maxBytes: number = DEFAULT_MAX_BUFFER_SIZE,
): Promise<Buffer> {
  if (Buffer.isBuffer(data)) {
    if (data.length > maxBytes) {
      throw new Error(
        `Buffer size ${data.length} bytes exceeds limit of ${maxBytes} bytes`,
      );
    }
    return data;
  }

  if (typeof data === "string") {
    const buf = Buffer.from(data, "utf-8");
    if (buf.length > maxBytes) {
      throw new Error(
        `String size ${buf.length} bytes exceeds limit of ${maxBytes} bytes`,
      );
    }
    return buf;
  }

  if (data instanceof Uint8Array) {
    if (data.byteLength > maxBytes) {
      throw new Error(
        `Uint8Array size ${data.byteLength} bytes exceeds limit of ${maxBytes} bytes`,
      );
    }
    return Buffer.from(data);
  }

  // Readable stream — accumulate with size guard
  const stream = data as Readable;
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;

    if (totalBytes > maxBytes) {
      stream.destroy();
      throw new Error(
        `Stream exceeded size limit of ${maxBytes} bytes (read ${totalBytes} bytes so far)`,
      );
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

// ── Retry ──────────────────────────────────────────────────────────────

/** Error codes that indicate a transient network failure. */
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
  "EAI_AGAIN",
]);

/** Returns true when an error looks like a transient network problem. */
function isRetryable(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;

  // Node.js system errors carry a `code` string.
  const code = (err as Record<string, unknown>).code;
  if (typeof code === "string" && RETRYABLE_CODES.has(code)) return true;

  // Some HTTP client wrappers surface a numeric status.
  const status = (err as Record<string, unknown>).status;
  if (typeof status === "number" && (status === 429 || status >= 500)) {
    return true;
  }

  // AWS SDK v3 wraps errors with a $metadata.httpStatusCode field.
  const meta = (err as Record<string, unknown>).$metadata;
  if (meta && typeof meta === "object") {
    const httpStatus = (meta as Record<string, unknown>).httpStatusCode;
    if (
      typeof httpStatus === "number" &&
      (httpStatus === 429 || httpStatus >= 500)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Retry an async operation with exponential backoff and jitter.
 *
 * Only retries on transient network errors (ECONNRESET, ETIMEDOUT, etc.)
 * and server-side HTTP errors (429, 5xx). All other errors propagate
 * immediately.
 *
 * @param fn          The async operation to execute.
 * @param maxRetries  Maximum number of retry attempts (default 3).
 * @param baseDelay   Base delay in milliseconds (default 200).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 200,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }

      // Exponential backoff with full jitter
      const delay = baseDelay * 2 ** attempt * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but satisfies the type checker
  throw lastError;
}
