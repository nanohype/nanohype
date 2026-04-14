// ── Atlassian (Confluence / Jira) ────────────────────────────────────
//
// Atlassian's OAuth 2.0 (3LO) endpoint. Requires `audience=api.atlassian.com`
// on the auth URL; tokens are short-lived (typically ~1h) and refreshable.

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";
import { expiresAtFromExpiresIn } from "./shared.js";

interface AtlassianTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function parse(raw: unknown, previous?: TokenGrant): TokenGrant {
  const r = raw as AtlassianTokenResponse;
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? previous?.refreshToken,
    expiresAt: expiresAtFromExpiresIn(r.expires_in),
    scope: r.scope,
    raw: r as unknown as Record<string, unknown>,
  };
}

export const atlassianProvider: OAuthProvider = {
  name: "atlassian",
  authUrl:
    "https://auth.atlassian.com/authorize" +
    "?audience=api.atlassian.com" +
    "&response_type=code" +
    "&prompt=consent" +
    "&client_id={client_id}" +
    "&redirect_uri={redirect_uri}" +
    "&scope={scope}" +
    "&state={state}" +
    "&code_challenge={code_challenge}" +
    "&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://auth.atlassian.com/oauth/token",
  defaultScopes: [
    "read:confluence-content.all",
    "read:confluence-space.summary",
    "offline_access",
  ],
  usePkce: true,

  parseTokenResponse(raw) {
    return parse(raw);
  },

  refreshTokenResponse(raw, previous) {
    return parse(raw, previous);
  },
};

registerProvider("atlassian", () => atlassianProvider);
