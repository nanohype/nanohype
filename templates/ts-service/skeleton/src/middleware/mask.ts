// ── Sensitive Data Masking ──────────────────────────────────────────
//
// Utilities for redacting secrets from log output. Masks bearer tokens,
// API keys, database URLs with embedded passwords, and sensitive
// headers before they reach structured log entries.
//

const BEARER_RE = /Bearer\s+\S+/gi;
const URL_PASSWORD_RE = /(:\/\/[^:]+):([^@]+)@/g;
const API_KEY_RE = /(sk-|ghp_|gho_|glpat-|xox[bsrap]-|whsec_|rk-|pk_)\S+/gi;

/**
 * Mask a single string value that may contain embedded secrets.
 *
 * - Bearer tokens → `Bearer ***`
 * - Connection URLs with passwords → `protocol://***@host/db`
 * - Substrings that look like API keys → `***`
 */
export function maskSensitive(value: string): string {
  let masked = value;

  // Mask Bearer tokens
  masked = masked.replace(BEARER_RE, "Bearer ***");

  // Mask URLs with embedded passwords (user:pass@host)
  masked = masked.replace(URL_PASSWORD_RE, "://***@");

  // Mask substrings that look like API keys
  masked = masked.replace(API_KEY_RE, "***");

  return masked;
}

/** Header names that always contain sensitive values. */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

/** Substrings that flag a header name as sensitive. */
const SENSITIVE_SUBSTRINGS = ["key", "secret", "token", "password"];

function isSensitiveHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_HEADERS.has(lower)) return true;
  return SENSITIVE_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * Return a copy of the headers object with sensitive values replaced by
 * `***`. Authorization headers that start with "Bearer" preserve the
 * scheme prefix for debuggability: `Bearer ***`.
 */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (isSensitiveHeader(name)) {
      // Preserve "Bearer" scheme hint if present
      result[name] = /^Bearer\s/i.test(value) ? "Bearer ***" : "***";
    } else {
      result[name] = value;
    }
  }

  return result;
}
