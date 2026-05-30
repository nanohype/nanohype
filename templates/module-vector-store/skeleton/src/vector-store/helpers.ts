// -- Helpers ─────────────────────────────────────────────────────────
//
// Shared utilities used by vector store providers.
//
// - withRetry()    Retries an async operation on transient network errors
//                  using exponential backoff with jitter.
// - withTimeout()  Races an async operation against an AbortSignal timeout
//                  so SDK calls that expose no native timeout still bound.
// - batchChunk()   Splits an array into fixed-size batches for providers
//                  that limit upsert payload size.
//

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

// ── Timeout ────────────────────────────────────────────────────────────

/**
 * Race an async operation against a timeout.
 *
 * For SDK clients that don't expose a per-call AbortSignal, this bounds
 * the wall-clock time of the call: if it doesn't settle within `ms`, the
 * returned promise rejects. The underlying operation is not cancelled —
 * it is abandoned — so callers should still set client-level retry caps.
 *
 * @param fn     The async operation to run.
 * @param ms     Timeout in milliseconds.
 * @param label  Label used in the timeout error message.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error(`${label} timed out after ${ms}ms`));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    fn(signal).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

// ── Batch Chunking ────────────────────────────────────────────────────

/**
 * Split an array into fixed-size batches.
 *
 * Used by providers that limit the number of items per upsert request
 * (e.g. Pinecone limits to 100 vectors per upsert).
 *
 * @param items      The array to chunk.
 * @param batchSize  Maximum number of items per batch.
 * @returns          Array of batches.
 */
export function batchChunk<T>(items: T[], batchSize: number): T[][] {
  if (batchSize <= 0) throw new Error("batchSize must be greater than 0");

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
