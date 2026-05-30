// ── Notion ───────────────────────────────────────────────────────────
//
// Notion OAuth integrations issue a single long-lived access token —
// there are no refresh tokens and no expiry. We still require PKCE
// because Notion's /v1/oauth/token endpoint accepts it and rejecting
// PKCE by default adds meaningful resistance to code-interception
// attacks even when the redirect is on HTTPS.

import { z } from "zod";

import type { OAuthProvider, TokenGrant } from "./types.js";
import { registerProvider } from "./registry.js";

// Notion issues a single long-lived access token plus workspace metadata.
// `.passthrough()` keeps `bot_id` / `workspace_*` / `owner` on `raw`.
const NotionTokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string().optional(),
    bot_id: z.string().optional(),
    workspace_id: z.string().optional(),
    workspace_name: z.string().optional(),
    workspace_icon: z.string().optional(),
  })
  .passthrough();

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
    const r = NotionTokenResponseSchema.parse(raw);
    const grant: TokenGrant = {
      accessToken: r.access_token,
      raw: r as Record<string, unknown>,
    };
    return grant;
  },
};

registerProvider("notion", () => notionProvider);
