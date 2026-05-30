// ── HubSpot ──────────────────────────────────────────────────────────
//
// HubSpot OAuth. Scopes are space-separated in the auth URL. Tokens
// expire (~30 minutes) and are refreshable. Refresh responses include
// a fresh refresh_token that replaces the old one.

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";
import { expiresAtFromExpiresIn, TokenResponseSchema } from "./shared.js";

function parse(raw: unknown, previous?: TokenGrant): TokenGrant {
  const r = TokenResponseSchema.parse(raw);
  return {
    accessToken: r.access_token ?? "",
    refreshToken: r.refresh_token ?? previous?.refreshToken,
    expiresAt: expiresAtFromExpiresIn(r.expires_in),
    raw: r as Record<string, unknown>,
  };
}

export const hubspotProvider: OAuthProvider = {
  name: "hubspot",
  authUrl:
    "https://app.hubspot.com/oauth/authorize" +
    "?response_type=code" +
    "&client_id={client_id}" +
    "&redirect_uri={redirect_uri}" +
    "&scope={scope}" +
    "&state={state}" +
    "&code_challenge={code_challenge}" +
    "&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://api.hubapi.com/oauth/v1/token",
  defaultScopes: ["oauth", "crm.objects.contacts.read"],
  usePkce: true,

  parseTokenResponse(raw) {
    return parse(raw);
  },

  refreshTokenResponse(raw, previous) {
    return parse(raw, previous);
  },
};

registerProvider("hubspot", () => hubspotProvider);
