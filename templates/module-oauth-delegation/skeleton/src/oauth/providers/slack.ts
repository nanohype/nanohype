// ── Slack ────────────────────────────────────────────────────────────
//
// Slack's v2 OAuth returns a nested structure: when the user approves
// user-scope scopes, the access token lives at `authed_user.access_token`
// and `authed_user.refresh_token`. Bot tokens use the top-level
// `access_token`. This adapter reads the user-scope path by default;
// override `parseTokenResponse` if you want the bot token.

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";
import { expiresAtFromExpiresIn } from "./shared.js";

interface SlackTokenResponse {
  ok: boolean;
  access_token?: string; // bot token
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  authed_user?: {
    id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  team?: { id?: string; name?: string };
}

function parse(raw: unknown, previous?: TokenGrant): TokenGrant {
  const r = raw as SlackTokenResponse;
  const u = r.authed_user ?? {};
  return {
    accessToken: u.access_token ?? r.access_token ?? "",
    refreshToken: u.refresh_token ?? r.refresh_token ?? previous?.refreshToken,
    expiresAt: expiresAtFromExpiresIn(u.expires_in ?? r.expires_in),
    scope: u.scope ?? r.scope,
    raw: r as unknown as Record<string, unknown>,
  };
}

export const slackProvider: OAuthProvider = {
  name: "slack",
  authUrl:
    "https://slack.com/oauth/v2/authorize" +
    "?response_type=code" +
    "&client_id={client_id}" +
    "&redirect_uri={redirect_uri}" +
    "&user_scope={scope}" +
    "&state={state}" +
    "&code_challenge={code_challenge}" +
    "&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  revokeUrl: "https://slack.com/api/auth.revoke",
  defaultScopes: ["channels:read", "chat:write"],
  usePkce: true,

  parseTokenResponse(raw) {
    return parse(raw);
  },

  refreshTokenResponse(raw, previous) {
    return parse(raw, previous);
  },
};

registerProvider("slack", () => slackProvider);
