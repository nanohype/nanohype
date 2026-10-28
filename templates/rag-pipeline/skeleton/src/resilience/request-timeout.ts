/**
 * How long the LLM and embedding providers wait on a model call before they
 * abandon it, so a hung connection fails into the provider's circuit breaker
 * instead of holding the pipeline. config.ts reads LLM_REQUEST_TIMEOUT_MS into
 * `requestTimeoutMs`, the pipeline hands that to every provider it builds, and
 * a provider built without one takes DEFAULT_REQUEST_TIMEOUT_MS. The bedrock,
 * anthropic and openai providers read it; the cohere embedder runs under its
 * SDK's own timeout.
 *
 * The anthropic and openai SDK clients apply it to each attempt and retry an
 * attempt that times out REQUEST_MAX_RETRIES times, so an endpoint that never
 * answers holds the pipeline for two timeouts plus the SDK's backoff between
 * the attempts. The bedrock providers bound each call with one abort signal
 * that fires at the timeout, so the same endpoint holds the pipeline for one
 * timeout, the SDK's retries included.
 */

/** The request timeout when LLM_REQUEST_TIMEOUT_MS is unset or empty, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * How many more attempts the anthropic and openai SDK clients make after an
 * attempt that times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;
