// ── Slack ────────────────────────────────────────────────────────────
//
// Slack's v2 OAuth returns a nested structure: when the user approves
// user-scope scopes, the access token lives at `authed_user.access_token`
// and `authed_user.refresh_token`. Bot tokens use the top-level
// `access_token`. This adapter reads the user-scope path by default;
// override `parseTokenResponse` if you want the bot token.

import { z } from "zod";

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";
import { expiresAtFromExpiresIn } from "./shared.js";

// Slack's response is nested: user-scope tokens live under `authed_user`,
// bot tokens at the top level. `.passthrough()` keeps `team` and other
// extras available on `raw`.
const SlackTokenResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    access_token: z.string().optional(), // bot token
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
    authed_user: z
      .object({
        id: z.string().optional(),
        access_token: z.string().optional(),
        refresh_token: z.string().optional(),
        expires_in: z.number().optional(),
        scope: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function parse(raw: unknown, previous?: TokenGrant): TokenGrant {
  const r = SlackTokenResponseSchema.parse(raw);
  const u = r.authed_user ?? {};
  return {
    accessToken: u.access_token ?? r.access_token ?? "",
    refreshToken: u.refresh_token ?? r.refresh_token ?? previous?.refreshToken,
    expiresAt: expiresAtFromExpiresIn(u.expires_in ?? r.expires_in),
    scope: u.scope ?? r.scope,
    raw: r as Record<string, unknown>,
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
