// ── Provider-shared helpers ──────────────────────────────────────────

/**
 * Convert an `expires_in` (seconds-from-now, the shape OAuth servers
 * return) into an absolute unix-seconds `expiresAt`. Returns undefined
 * when the provider omits expiry (e.g., Notion's long-lived grants).
 */
export function expiresAtFromExpiresIn(expiresIn?: number): number | undefined {
  if (!expiresIn) return undefined;
  return Math.floor(Date.now() / 1000) + expiresIn;
}
