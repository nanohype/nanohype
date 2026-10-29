/**
 * How long an embedding call waits before it gives up, so a hung connection
 * fails into the provider's circuit breaker instead of holding the cache:
 * EMBED_REQUEST_TIMEOUT_MS, which every embedding provider here reads. It is
 * read as this module loads, so a value the parse refuses fails the import
 * rather than the first call.
 */

/** The timeout when EMBED_REQUEST_TIMEOUT_MS is unset or empty, in milliseconds. */
export const DEFAULT_EMBED_REQUEST_TIMEOUT_MS = 30_000;

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

/** The timeout EMBED_REQUEST_TIMEOUT_MS sets, in milliseconds. */
export const EMBED_REQUEST_TIMEOUT_MS = parseTimeoutMs(
  "EMBED_REQUEST_TIMEOUT_MS",
  process.env.EMBED_REQUEST_TIMEOUT_MS,
  DEFAULT_EMBED_REQUEST_TIMEOUT_MS,
);
