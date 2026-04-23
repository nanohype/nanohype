// ── Typed errors ─────────────────────────────────────────────────────
//
// All error messages are stable, code-shaped strings that expose only
// the error kind and (where safe) the provider name. Token material —
// access tokens, refresh tokens, authorization codes, code verifiers,
// client secrets — must never appear in an error message.

export class OAuthError extends Error {
  readonly code: string;
  readonly provider?: string;

  constructor(code: string, message: string, provider?: string) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.provider = provider;
  }
}

export class StateTamperedError extends OAuthError {
  constructor() {
    super("state_tampered", "state cookie signature mismatch");
  }
}

export class StateExpiredError extends OAuthError {
  constructor() {
    super("state_expired", "state cookie expired");
  }
}

export class StateMissingError extends OAuthError {
  constructor() {
    super("state_missing", "state cookie not present on callback");
  }
}

export class UserMismatchError extends OAuthError {
  constructor() {
    super("user_mismatch", "state userId does not match authenticated caller");
  }
}

export class UnauthenticatedError extends OAuthError {
  constructor() {
    super("unauthenticated", "resolveUserId returned null");
  }
}

export class UnknownProviderError extends OAuthError {
  constructor(provider: string) {
    super("unknown_provider", `no provider registered: ${provider}`, provider);
  }
}

export class MissingCredentialsError extends OAuthError {
  constructor(provider: string) {
    super("missing_credentials", `no clientCredentials for provider: ${provider}`, provider);
  }
}

export class RedirectMismatchError extends OAuthError {
  constructor(provider: string) {
    super("redirect_mismatch", `redirect_uri does not match registered value`, provider);
  }
}

export class RefreshFailedError extends OAuthError {
  readonly status?: number;
  constructor(provider: string, status?: number) {
    super("refresh_failed", `refresh rejected by provider`, provider);
    this.status = status;
  }
}

export class ProviderError extends OAuthError {
  readonly status?: number;
  constructor(provider: string, code: string, message: string, status?: number) {
    super(code, message, provider);
    this.status = status;
  }
}

export class ConfigError extends OAuthError {
  constructor(message: string) {
    super("config_error", message);
  }
}

/**
 * Typed-narrow alternative to `(err as Error).message`. Accepts thrown values
 * that JavaScript allows to be non-Error (strings, nulls, anything) and
 * returns a string suitable for logging without leaking token material —
 * callers are still expected to scrub the result via the redacting logger.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
