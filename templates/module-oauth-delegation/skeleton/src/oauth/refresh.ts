// ── Refresh-before-expiry with per-key dedup ─────────────────────────
//
// When a caller asks for a valid token we check `expiresAt`. If it is
// within `leadTimeSeconds` of now we refresh before returning. Multiple
// concurrent callers in the same process share a single refresh via the
// `inflight` map.
//
// Failures do not retry. On any non-2xx refresh we delete the stored
// grant, emit a revocation event with reason `refresh-failed`, and
// return null so the next call forces re-auth.

import { errorMessage } from "./errors.js";
import { logger } from "./logger.js";
import type {
  ClientCredentials,
  OAuthProvider,
  RevocationEmitter,
  TokenGrant,
  TokenStorage,
} from "./types.js";

/** Token-endpoint timeout. A slow provider must not tie up the event loop. */
const FETCH_TIMEOUT_MS = 10_000;

export interface RefreshDeps {
  storage: TokenStorage;
  emitter?: RevocationEmitter;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests. Defaults to Date.now / 1000. */
  now?: () => number;
}

export class TokenRefresher {
  private readonly inflight = new Map<string, Promise<TokenGrant | null>>();

  constructor(
    private readonly providers: Record<string, OAuthProvider>,
    private readonly credentials: Record<string, ClientCredentials>,
    private readonly deps: RefreshDeps,
    private readonly leadTimeSeconds: number,
  ) {}

  private now(): number {
    return (this.deps.now ?? (() => Math.floor(Date.now() / 1000)))();
  }

  private fetch(input: string, init?: RequestInit): Promise<Response> {
    return (this.deps.fetchImpl ?? fetch)(input, init);
  }

  private key(userId: string, provider: string): string {
    return `${userId}::${provider}`;
  }

  private isExpiring(grant: TokenGrant): boolean {
    if (grant.expiresAt === undefined) return false;
    return grant.expiresAt < this.now() + this.leadTimeSeconds;
  }

  async getValidToken(userId: string, provider: string): Promise<string | null> {
    const grant = await this.deps.storage.get(userId, provider);
    if (!grant) return null;
    if (!this.isExpiring(grant)) return grant.accessToken;

    const refreshed = await this.refreshCoalesced(userId, provider, grant);
    return refreshed?.accessToken ?? null;
  }

  async refresh(userId: string, provider: string): Promise<TokenGrant | null> {
    const grant = await this.deps.storage.get(userId, provider);
    if (!grant) return null;
    return this.refreshCoalesced(userId, provider, grant);
  }

  private refreshCoalesced(
    userId: string,
    provider: string,
    previous: TokenGrant,
  ): Promise<TokenGrant | null> {
    const key = this.key(userId, provider);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.doRefresh(userId, provider, previous).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  private async doRefresh(
    userId: string,
    provider: string,
    previous: TokenGrant,
  ): Promise<TokenGrant | null> {
    const adapter = this.providers[provider];
    const creds = this.credentials[provider];

    if (!adapter || !creds) {
      logger.warn("refresh aborted — provider not configured", { provider });
      return null;
    }
    if (!previous.refreshToken) {
      // Provider doesn't issue refresh tokens (e.g., Notion) — nothing to do.
      return previous;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: previous.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });

    let response: Response;
    try {
      response = await this.fetch(adapter.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      logger.warn("refresh network error", {
        provider,
        userId,
        error: errorMessage(err),
      });
      await this.purgeAndEmit(userId, provider);
      return null;
    }

    if (!response.ok) {
      logger.warn("refresh rejected", {
        provider,
        userId,
        status: response.status,
      });
      await this.purgeAndEmit(userId, provider);
      return null;
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      logger.warn("refresh response not JSON", { provider, userId });
      await this.purgeAndEmit(userId, provider);
      return null;
    }

    const parsed = adapter.refreshTokenResponse
      ? adapter.refreshTokenResponse(raw, previous)
      : adapter.parseTokenResponse(raw);

    // Providers like Google omit refresh_token on refresh — reuse the previous one.
    const next: TokenGrant = {
      ...parsed,
      refreshToken: parsed.refreshToken ?? previous.refreshToken,
    };

    await this.deps.storage.put(userId, provider, next);
    return next;
  }

  private async purgeAndEmit(userId: string, provider: string): Promise<void> {
    try {
      await this.deps.storage.delete(userId, provider);
    } catch (err) {
      logger.warn("storage delete failed after refresh failure", {
        provider,
        userId,
        error: errorMessage(err),
      });
    }
    if (this.deps.emitter) {
      try {
        await this.deps.emitter.emit({ userId, provider, reason: "refresh-failed" });
      } catch (err) {
        logger.warn("revocation emit failed", { provider, userId, error: errorMessage(err) });
      }
    }
  }
}
