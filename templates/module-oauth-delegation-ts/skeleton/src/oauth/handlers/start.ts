// ── /oauth/:provider/start ───────────────────────────────────────────
//
// Builds the auth URL with PKCE challenge + signed state cookie, then
// redirects the user to the provider. Returns 302 + Set-Cookie.

import {
  MissingCredentialsError,
  UnauthenticatedError,
  UnknownProviderError,
} from "../errors.js";
import { codeChallenge, generateCodeVerifier } from "../pkce.js";
import {
  buildStateCookie,
  generateNonce,
  signState,
  type StatePayload,
} from "../state.js";
import type {
  ClientCredentials,
  OAuthProvider,
  OAuthRouterConfig,
  RequestHandler,
} from "../types.js";
import { mapHandlerError } from "./errorMapping.js";
import { extractProvider, extractReturnTo, providerScopes } from "./shared.js";

export function createStartHandler(config: OAuthRouterConfig): RequestHandler {
  const stateTtl = config.stateTtlSeconds ?? 600;

  return async (req) => {
    try {
      const providerName = extractProvider(req.url, "start");
      const adapter: OAuthProvider | undefined = config.providers[providerName];
      if (!adapter) throw new UnknownProviderError(providerName);

      const creds: ClientCredentials | undefined = config.clientCredentials[providerName];
      if (!creds) throw new MissingCredentialsError(providerName);

      const userId = await config.resolveUserId(req);
      if (!userId) throw new UnauthenticatedError();

      const verifier = adapter.usePkce ? generateCodeVerifier() : "";
      const challenge = verifier ? codeChallenge(verifier) : "";
      const nonce = generateNonce();
      const returnTo = extractReturnTo(req.url);

      const payload: StatePayload = {
        nonce,
        userId,
        provider: providerName,
        returnTo,
        createdAt: Math.floor(Date.now() / 1000),
        codeVerifier: verifier,
      };
      const signed = signState(payload, config.stateSigningSecret);

      const scopes = providerScopes(adapter, providerName, config);
      const authUrl = buildAuthUrl(adapter.authUrl, {
        client_id: creds.clientId,
        redirect_uri: creds.redirectUri,
        scope: scopes.join(" "),
        state: nonce,
        code_challenge: challenge,
        code_challenge_method: challenge ? "S256" : "",
      });

      return new Response(null, {
        status: 302,
        headers: {
          location: authUrl,
          "set-cookie": buildStateCookie(signed, stateTtl, config.cookieDomain),
        },
      });
    } catch (err) {
      return mapHandlerError(err, "start");
    }
  };
}

function buildAuthUrl(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(encodeURIComponent(v));
  }
  return out;
}
