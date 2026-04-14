// ── Redacting JSON logger ────────────────────────────────────────────
//
// Every log line is a single JSON object on stdout. Fields whose names
// appear in REDACT_FIELDS are replaced with "[redacted]" before
// serialization, at any depth. This is the enforcement mechanism for
// the "tokens never in logs" invariant.

/**
 * Depth at which redaction stops recursing. 32 is well past the deepest
 * plausible OAuth token response (provider `raw` shapes are typically 2-3
 * levels). The cap exists purely to bound pathological inputs; it should
 * never fire in normal use.
 */
const MAX_REDACT_DEPTH = 32;

const REDACT_FIELDS = new Set([
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "code",
  "codeVerifier",
  "code_verifier",
  "clientSecret",
  "client_secret",
  "authorization",
  "Authorization",
  "ciphertext",
  "Ciphertext",
  "CiphertextBlob",
  "Plaintext",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_REDACT_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_FIELDS.has(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(fields ? (redact(fields) as LogFields) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};

/** Exposed for tests — the set of field names that get redacted. */
export const _redactFields = REDACT_FIELDS;
