// ── Notion ───────────────────────────────────────────────────────────
//
// Notion OAuth integrations issue a single long-lived access token —
// there are no refresh tokens and no expiry. We still require PKCE
// because Notion's /v1/oauth/token endpoint accepts it and rejecting
// PKCE by default adds meaningful resistance to code-interception
// attacks even when the redirect is on HTTPS.

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";

interface NotionTokenResponse {
  access_token: string;
  token_type?: string;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner?: unknown;
}

export const notionProvider: OAuthProvider = {
  name: "notion",
  authUrl:
    "https://api.notion.com/v1/oauth/authorize" +
    "?owner=user" +
    "&response_type=code" +
    "&client_id={client_id}" +
    "&redirect_uri={redirect_uri}" +
    "&state={state}" +
    "&code_challenge={code_challenge}" +
    "&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://api.notion.com/v1/oauth/token",
  defaultScopes: [],
  usePkce: true,

  parseTokenResponse(raw) {
    const r = raw as NotionTokenResponse;
    const grant: TokenGrant = {
      accessToken: r.access_token,
      raw: r as unknown as Record<string, unknown>,
    };
    return grant;
  },
};

registerProvider("notion", () => notionProvider);
