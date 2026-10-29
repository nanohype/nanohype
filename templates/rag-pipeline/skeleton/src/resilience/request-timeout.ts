/**
 * How long the LLM and embedding providers wait on a model before they give
 * up on a call, so a hung connection fails into the provider's circuit
 * breaker instead of holding the pipeline. config.ts reads
 * LLM_REQUEST_TIMEOUT_MS into `requestTimeoutMs` with parseTimeoutMs(), the
 * pipeline hands that to every provider it builds, and a provider built
 * without one takes DEFAULT_REQUEST_TIMEOUT_MS. The gateway, bedrock,
 * anthropic and openai providers read it; the cohere embedder runs under its
 * SDK's own timeout.
 *
 * A call has to finish its whole reply inside the timeout, so the timeout
 * caps LLM_MAX_TOKENS: the 120000 ms default covers 4096 tokens at about 34
 * tokens a second, four times the 1024-token default. A deployment that
 * raises LLM_MAX_TOKENS past that raises the timeout with it.
 *
 * The anthropic and openai SDK clients apply it to each attempt and retry an
 * attempt that times out REQUEST_MAX_RETRIES times, so an endpoint that never
 * answers holds the pipeline for two timeouts plus the SDK's backoff between
 * the attempts. The gateway providers bound each call once, and the bedrock
 * providers bound each call once, the SDK's retries included.
 */

/** The request timeout when LLM_REQUEST_TIMEOUT_MS is unset or empty, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** The longest timeout a setting takes: the longest delay a Node.js timer holds. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Reads `setting`, a timeout in milliseconds written in digits: a whole
 * number from 1 to 2147483647, and `fallback` when unset or empty.
 */
export function parseTimeoutMs(
  setting: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") return fallback;
  const ms = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(ms >= 1 && ms <= MAX_TIMEOUT_MS)) {
    throw new Error(
      `${setting} must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}, got "${value}"`,
    );
  }
  return ms;
}

/**
 * How many more attempts the anthropic and openai SDK clients make after an
 * attempt that times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;

/** A model call that outlasted its timeout. */
export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`No answer from the model within ${timeoutMs} ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Runs `call` and gives up on it after `timeoutMs`: the returned promise
 * rejects with RequestTimeoutError and the signal handed to `call` aborts,
 * so an SDK that takes it drops the request. The timer is cleared when
 * `call` settles first.
 */
export async function withRequestTimeout<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new RequestTimeoutError(timeoutMs);
      // Rejecting before the abort settles the race with this error, not
      // with whatever the SDK makes of the abort.
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
