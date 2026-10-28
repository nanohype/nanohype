// ── Request Timeout ─────────────────────────────────────────────────
//
// How long a provider waits on a model call before it abandons it, so a
// hung connection fails into the provider's circuit breaker instead of
// holding the caller. The bedrock, anthropic, openai and groq providers
// read this one setting, LLM_REQUEST_TIMEOUT_MS, as this module loads, so
// a value it refuses fails the import rather than the first request.
//
// The anthropic, openai and groq SDK clients apply it to each attempt and
// retry an attempt that times out REQUEST_MAX_RETRIES times, so an
// endpoint that never answers holds the caller for two timeouts plus the
// SDK's backoff between the attempts. The bedrock provider bounds each
// call with one abort signal that fires at the timeout, so the same
// endpoint holds the caller for one timeout, the SDK's retries included.
//

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Reads an LLM_REQUEST_TIMEOUT_MS setting: a positive whole number of
 * milliseconds, 30000 when unset or empty.
 */
export function parseRequestTimeoutMs(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_REQUEST_TIMEOUT_MS;
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(
      `LLM_REQUEST_TIMEOUT_MS must be a positive whole number of milliseconds, got "${value}"`,
    );
  }
  return ms;
}

/** The request timeout LLM_REQUEST_TIMEOUT_MS sets, in milliseconds. */
export const REQUEST_TIMEOUT_MS = parseRequestTimeoutMs(process.env.LLM_REQUEST_TIMEOUT_MS);

/**
 * How many more attempts the anthropic, openai and groq SDK clients make
 * after an attempt that times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;
