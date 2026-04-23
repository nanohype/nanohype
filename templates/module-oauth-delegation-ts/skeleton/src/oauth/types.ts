// ── Public type surface ──────────────────────────────────────────────
//
// These interfaces are the contract between the module and its
// consumers. They are re-exported from `./index.ts` so consumers import
// from the package root, not from here.

/**
 * An OAuth 2.0 access grant as returned by the provider's token endpoint
 * (post-parsing). `accessToken` is mandatory; the rest are provider-dependent.
 */
export interface TokenGrant {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry, unix seconds. Missing means the provider doesn't expire tokens (e.g., Notion). */
  expiresAt?: number;
  scope?: string;
  raw?: Record<string, unknown>;
}

/**
 * Durable per-(userId, provider) storage of {@link TokenGrant}s.
 *
 * Implementations must tolerate concurrent access — the router dedups
 * in-flight refreshes within a single process, but the storage itself
 * may still see concurrent writes from other instances.
 */
export interface TokenStorage {
  get(userId: string, provider: string): Promise<TokenGrant | null>;
  put(userId: string, provider: string, grant: TokenGrant): Promise<void>;
  delete(userId: string, provider: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

/**
 * Reason codes for a revocation event. `user` — user-initiated disconnect.
 * `offboarding` — bulk removal (e.g., when a user leaves the workspace).
 * `refresh-failed` — the provider rejected the refresh; the token has
 * been deleted and re-auth is required.
 */
export type RevocationReason = "user" | "offboarding" | "refresh-failed";

/**
 * Optional sink for revocation events. Default is a no-op; consumers may
 * inject a webhook or pub/sub publisher to propagate disconnects to
 * downstream systems.
 */
export interface RevocationEmitter {
  emit(event: { userId: string; provider: string; reason: RevocationReason }): Promise<void>;
}

/**
 * Adapter for a single OAuth 2.0 provider. Ship one per provider; call
 * {@link registerProvider} at import time to make it discoverable.
 *
 * `authUrl` is a template string containing placeholders that the router
 * substitutes: `{client_id}`, `{redirect_uri}`, `{scope}`, `{state}`,
 * `{code_challenge}`, `{code_challenge_method}`. Provider-specific extras
 * (e.g., `access_type=offline`) can be baked into the template.
 */
export interface OAuthProvider {
  readonly name: string;
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl?: string;
  readonly defaultScopes: string[];
  readonly usePkce: boolean;

  parseTokenResponse(raw: unknown): TokenGrant;
  /**
   * Optional override for refresh responses when they differ in shape from
   * the initial authorization-code response (e.g., Google omits
   * `refresh_token` on refresh — the caller is expected to reuse the
   * existing one).
   */
  refreshTokenResponse?(raw: unknown, previous: TokenGrant): TokenGrant;
}

/** Per-client credentials — one record per provider. Redirect URIs are exact-matched. */
export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Framework-neutral HTTP handler. Accepts a Web-standard {@link Request}
 * and returns a {@link Response}. Consumers wire this into Hono, Express,
 * Lambda, or raw `node:http` with thin adapters.
 */
export type RequestHandler = (req: Request) => Promise<Response>;

/** Caller-identity resolution — injected by the consumer. Returns null if unauthenticated. */
export type ResolveUserId = (req: Request) => Promise<string | null>;

export interface OAuthRouterConfig {
  providers: Record<string, OAuthProvider>;
  storage: TokenStorage;
  /** HMAC-SHA256 signing key for the state cookie. Any random string ≥ 32 bytes works. */
  stateSigningSecret: string;
  resolveUserId: ResolveUserId;
  clientCredentials: Record<string, ClientCredentials>;
  /** Optional Domain attribute on the state cookie. */
  cookieDomain?: string;
  /** Refresh window — refresh when `expiresAt < now + leadTimeSeconds`. Default 60. */
  leadTimeSeconds?: number;
  /** State cookie TTL. Default 600 (10 minutes). */
  stateTtlSeconds?: number;
  /** Optional revocation event sink. Default is a no-op. */
  revocationEmitter?: RevocationEmitter;
  /**
   * Optional scope override per provider. Falls back to the adapter's
   * `defaultScopes` when absent. Lets one consumer request Notion
   * read-only while another requests read-write.
   */
  scopes?: Record<string, string[]>;
}

export interface OAuthRouter {
  handlers: {
    start: RequestHandler;
    callback: RequestHandler;
    refresh: RequestHandler;
    revoke: RequestHandler;
  };
  getValidToken(userId: string, provider: string): Promise<string | null>;
  revokeTokens(userId: string, provider: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
