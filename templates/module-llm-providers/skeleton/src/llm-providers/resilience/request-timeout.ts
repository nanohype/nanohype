// ── Request Timeout ─────────────────────────────────────────────────
//
// How long a provider waits on a model before it gives up on a call, so a
// hung connection fails into the provider's circuit breaker instead of
// holding the caller. Every provider reads LLM_REQUEST_TIMEOUT_MS except
// ollama, which reads OLLAMA_REQUEST_TIMEOUT_MS (ollama.ts gives why), and
// each create*Provider() takes `requestTimeoutMs` to set it per instance.
// The settings are read as their modules load, so a value the parse
// refuses fails the import rather than the first request.
//
// A call that does not stream has to finish its whole reply inside the
// timeout, so the timeout caps maxTokens: the 120000 ms default covers the
// providers' 4096-token default at about 34 tokens a second. A caller that
// raises maxTokens raises the timeout with it, or streams. A stream is
// bounded per event instead (stream-guard.ts): it fails when the provider
// sends nothing for one timeout, so a long reply that keeps arriving never
// reaches it. Its longest silent stretch, hidden thinking included, is the
// time to generate maxTokens, so the same default covers it.
//
// The anthropic, openai and groq SDK clients apply the timeout to each
// attempt of a call that does not stream and retry an attempt that times
// out REQUEST_MAX_RETRIES times, so an endpoint that never answers holds
// the caller for two timeouts plus the SDK's backoff between the attempts.
// The gateway, bedrock, vertex, huggingface and ollama providers bound such
// a call once, retries included: the gateway provider resends a request the
// route's rate limit refuses only while the wait ends inside the timeout.
//

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
 * How many more attempts the anthropic, openai and groq SDK clients make
 * after an attempt that times out or fails with an error the SDK retries.
 */
export const REQUEST_MAX_RETRIES = 1;

/** A model call, or a wait for a stream's next event, that outlasted its timeout. */
export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`No answer from the model within ${timeoutMs} ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Runs `call` and gives up on it after `timeoutMs`: the returned promise
 * rejects with RequestTimeoutError and `controller` aborts, so an SDK that
 * takes its signal drops the request. The timer is cleared when `call`
 * settles first.
 */
export async function withRequestTimeout<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => T | Promise<T>,
  controller: AbortController = new AbortController(),
): Promise<T> {
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
