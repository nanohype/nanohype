/**
 * Resilience primitives: deadline-bound awaits and jittered retries.
 *
 * `withTimeout` races a promise against a deadline and rejects with
 * `TimeoutError` when the deadline wins. The underlying promise is NOT
 * cancelled (a JS limitation) — the caller just stops waiting, so pair
 * it with a transport-level abort (AbortSignal, SDK requestHandler
 * timeout) when the downstream supports one.
 *
 * `withRetry` re-invokes a factory up to `attempts` times with jittered
 * exponential backoff. Only use it around idempotent calls. The sleep is
 * injectable so tests capture the delay schedule synchronously instead
 * of faking timers.
 *
 * Zero dependencies.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects with `TimeoutError` if `promise` does not settle within `ms`.
 * `label` names the operation in the error message for actionable logs.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Total invocation attempts (first call included). */
  attempts: number;
  /** Backoff before the second attempt, in ms. Doubles each retry. */
  initialDelayMs: number;
  /** Backoff ceiling, in ms. Default: 5000. */
  maxDelayMs?: number;
  /** Randomize each delay to 50–100% of the computed backoff. */
  jitter: boolean;
  /** Sleep override. Defaults to a real setTimeout sleep. Tests inject a recorder. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Invokes `factory` until it resolves or `attempts` is exhausted, sleeping
 * `initialDelayMs * 2^(attempt-1)` (capped at `maxDelayMs`, jittered when
 * `jitter` is set) between attempts. Throws the last error on exhaustion.
 */
export async function withRetry<T>(factory: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, initialDelayMs, maxDelayMs = 5_000, jitter } = options;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const base = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = jitter ? base * (0.5 + Math.random() * 0.5) : base;
      await sleep(delay);
    }
  }
  throw lastError;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
