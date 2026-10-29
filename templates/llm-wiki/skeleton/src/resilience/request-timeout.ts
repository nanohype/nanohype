/**
 * How long an LLM provider waits on a model call before it gives up on the
 * call (gateway) or on the attempt (anthropic), so a hung connection fails into its circuit
 * breaker instead of holding the operation. config.ts reads
 * LLM_REQUEST_TIMEOUT_MS with parseTimeoutMs() when the first operation
 * loads the configuration, so a value the parse refuses fails that operation
 * before any request.
 *
 * An attempt has to finish its whole reply inside the timeout, so the
 * timeout caps the reply's length: the 120000 ms default covers the anthropic
 * provider's 4096-token default at about 34 tokens a second. A caller that
 * raises maxTokens raises the timeout with it.
 *
 * The anthropic SDK client retries an attempt that times out
 * REQUEST_MAX_RETRIES times, so an endpoint that never answers holds the
 * operation for two timeouts plus the SDK's backoff between the attempts.
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
 * How many more attempts the anthropic SDK client makes after an attempt that
 * times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;
