// ── /oauth/:provider/revoke ──────────────────────────────────────────
//
// User-initiated disconnect. Best-effort call to the provider's
// revocation endpoint (if any), unconditional storage delete, and a
// revocation event with reason `user`.

import { UnauthenticatedError, UnknownProviderError, errorMessage } from "../errors.js";
import { logger } from "../logger.js";
import type { OAuthProvider, OAuthRouterConfig, RequestHandler } from "../types.js";
import { mapHandlerError } from "./errorMapping.js";
import { FETCH_TIMEOUT_MS, extractProvider } from "./shared.js";

export interface RevokeDeps {
  fetchImpl?: typeof fetch;
}

export function createRevokeHandler(
  config: OAuthRouterConfig,
  deps: RevokeDeps = {},
): RequestHandler {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return async (req) => {
    try {
      const providerName = extractProvider(req.url, "revoke");
      const adapter: OAuthProvider | undefined = config.providers[providerName];
      if (!adapter) throw new UnknownProviderError(providerName);

      const userId = await config.resolveUserId(req);
      if (!userId) throw new UnauthenticatedError();

      const existing = await config.storage.get(userId, providerName);
      if (existing && adapter.revokeUrl) {
        const body = new URLSearchParams({ token: existing.accessToken });
        const creds = config.clientCredentials[providerName];
        if (creds) {
          body.set("client_id", creds.clientId);
          body.set("client_secret", creds.clientSecret);
        }
        try {
          const response = await fetchImpl(adapter.revokeUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!response.ok) {
            logger.warn("provider revoke returned non-2xx", {
              provider: providerName,
              status: response.status,
            });
          }
        } catch (err) {
          logger.warn("provider revoke network error", {
            provider: providerName,
            error: errorMessage(err),
          });
        }
      }

      await config.storage.delete(userId, providerName);

      if (config.revocationEmitter) {
        try {
          await config.revocationEmitter.emit({ userId, provider: providerName, reason: "user" });
        } catch (err) {
          logger.warn("revocation emit failed", {
            provider: providerName,
            error: errorMessage(err),
          });
        }
      }

      return new Response(null, { status: 204 });
    } catch (err) {
      return mapHandlerError(err, "revoke");
    }
  };
}
