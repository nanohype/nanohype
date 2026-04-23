// ── /oauth/:provider/refresh ─────────────────────────────────────────
//
// Service-internal handler that forces a refresh for a specific
// (userId, provider). Useful for ops endpoints and scheduled sweepers.
// Not user-facing — the authorization check below ensures the caller
// is authenticated, but additional access control (e.g., restricting
// to admin tokens) is the consumer's responsibility.

import { UnauthenticatedError, UnknownProviderError } from "../errors.js";
import type { OAuthRouterConfig, RequestHandler } from "../types.js";
import type { TokenRefresher } from "../refresh.js";
import { mapHandlerError } from "./errorMapping.js";
import { extractProvider } from "./shared.js";

export function createRefreshHandler(
  config: OAuthRouterConfig,
  refresher: TokenRefresher,
): RequestHandler {
  return async (req) => {
    try {
      const providerName = extractProvider(req.url, "refresh");
      if (!config.providers[providerName]) throw new UnknownProviderError(providerName);

      const userId = await config.resolveUserId(req);
      if (!userId) throw new UnauthenticatedError();

      const grant = await refresher.refresh(userId, providerName);
      if (!grant) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ ok: true, expiresAt: grant.expiresAt ?? null }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    } catch (err) {
      return mapHandlerError(err, "refresh");
    }
  };
}
