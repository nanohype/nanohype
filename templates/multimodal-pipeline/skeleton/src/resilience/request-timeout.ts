/**
 * How long an LLM provider waits on a model call before it gives up on it,
 * so a hung connection fails into the provider's circuit breaker instead of
 * holding the pipeline. The anthropic and openai analysis providers read
 * LLM_REQUEST_TIMEOUT_MS as this module loads, so a value the parse refuses
 * fails the import rather than the first request. The whisper transcription
 * client runs under its SDK's own timeout.
 *
 * A call has to finish its whole reply inside the timeout, so the timeout
 * caps LLM_MAX_TOKENS: the 120000 ms default covers the 4096-token default at
 * about 34 tokens a second. A deployment that raises LLM_MAX_TOKENS raises the
 * timeout with it.
 *
 * The SDK clients apply it to each attempt and retry an attempt that times
 * out REQUEST_MAX_RETRIES times, so an endpoint that never answers holds the
 * pipeline for two timeouts plus the SDK's backoff between the attempts.
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

/** The request timeout LLM_REQUEST_TIMEOUT_MS sets, in milliseconds. */
export const REQUEST_TIMEOUT_MS = parseTimeoutMs(
  "LLM_REQUEST_TIMEOUT_MS",
  process.env.LLM_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
);

/**
 * How many more attempts the anthropic and openai SDK clients make after an
 * attempt that times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;
