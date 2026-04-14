// ── Google (Drive / Calendar / Analytics / ...) ──────────────────────
//
// Google's v2 OAuth endpoint. Refresh tokens are only returned when
// `access_type=offline&prompt=consent` are set on the auth URL — both
// are baked into the template. On refresh responses, Google omits
// `refresh_token`; the refresh path in refresh.ts reuses the previous
// one when missing.

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";
import { expiresAtFromExpiresIn } from "./shared.js";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

function parse(raw: unknown, previous?: TokenGrant): TokenGrant {
  const r = raw as GoogleTokenResponse;
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? previous?.refreshToken,
    expiresAt: expiresAtFromExpiresIn(r.expires_in),
    scope: r.scope,
    raw: r as unknown as Record<string, unknown>,
  };
}

export const googleProvider: OAuthProvider = {
  name: "google",
  authUrl:
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?response_type=code" +
    "&access_type=offline" +
    "&prompt=consent" +
    "&include_granted_scopes=true" +
    "&client_id={client_id}" +
    "&redirect_uri={redirect_uri}" +
    "&scope={scope}" +
    "&state={state}" +
    "&code_challenge={code_challenge}" +
    "&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revokeUrl: "https://oauth2.googleapis.com/revoke",
  defaultScopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ],
  usePkce: true,

  parseTokenResponse(raw) {
    return parse(raw);
  },

  refreshTokenResponse(raw, previous) {
    return parse(raw, previous);
  },
};

registerProvider("google", () => googleProvider);
