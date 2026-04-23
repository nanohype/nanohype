// ── createOAuthRouter ────────────────────────────────────────────────
//
// Top-level factory. Builds the four handlers, wires the refresher, and
// exposes the steady-state `getValidToken` / `revokeTokens` /
// `revokeAllForUser` calls.

import { createCallbackHandler, type CallbackDeps } from "./handlers/callback.js";
import { createRefreshHandler } from "./handlers/refresh.js";
import { createRevokeHandler, type RevokeDeps } from "./handlers/revoke.js";
import { createStartHandler } from "./handlers/start.js";
import { logger } from "./logger.js";
import { TokenRefresher } from "./refresh.js";
import type { OAuthRouter, OAuthRouterConfig } from "./types.js";

export interface CreateOAuthRouterDeps {
  /** Injectable for tests — used by callback, refresh, and revoke handlers + refresher. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests — used for state freshness and refresh expiry math. */
  now?: () => number;
}

export function createOAuthRouter(
  config: OAuthRouterConfig,
  deps: CreateOAuthRouterDeps = {},
): OAuthRouter {
  if (!config.stateSigningSecret || config.stateSigningSecret.length < 16) {
    throw new Error("stateSigningSecret must be at least 16 characters");
  }

  const leadTime = config.leadTimeSeconds ?? 60;

  const refresher = new TokenRefresher(
    config.providers,
    config.clientCredentials,
    {
      storage: config.storage,
      emitter: config.revocationEmitter,
      fetchImpl: deps.fetchImpl,
      now: deps.now,
    },
    leadTime,
  );

  const callbackDeps: CallbackDeps = { fetchImpl: deps.fetchImpl, now: deps.now };
  const revokeDeps: RevokeDeps = { fetchImpl: deps.fetchImpl };

  return {
    handlers: {
      start: createStartHandler(config),
      callback: createCallbackHandler(config, callbackDeps),
      refresh: createRefreshHandler(config, refresher),
      revoke: createRevokeHandler(config, revokeDeps),
    },

    async getValidToken(userId, provider) {
      if (!config.providers[provider]) return null;
      return refresher.getValidToken(userId, provider);
    },

    async revokeTokens(userId, provider) {
      await config.storage.delete(userId, provider);
      if (config.revocationEmitter) {
        try {
          await config.revocationEmitter.emit({ userId, provider, reason: "user" });
        } catch (err) {
          logger.warn("revocation emit failed", {
            provider,
            userId,
            error: (err as Error).message,
          });
        }
      }
    },

    async revokeAllForUser(userId) {
      await config.storage.deleteAllForUser(userId);
      if (config.revocationEmitter) {
        for (const providerName of Object.keys(config.providers)) {
          try {
            await config.revocationEmitter.emit({
              userId,
              provider: providerName,
              reason: "offboarding",
            });
          } catch (err) {
            logger.warn("revocation emit failed", {
              provider: providerName,
              userId,
              error: (err as Error).message,
            });
          }
        }
      }
    },
  };
}
