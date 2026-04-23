// ── /oauth/:provider/callback ────────────────────────────────────────
//
// The provider redirects the user back here with `code` and `state`.
// We verify the state cookie's HMAC, confirm it hasn't expired, confirm
// the caller's identity matches `state.userId`, then exchange the code
// for tokens and persist them.

import {
  OAuthError,
  ProviderError,
  RedirectMismatchError,
  StateExpiredError,
  StateMissingError,
  StateTamperedError,
  UnauthenticatedError,
  UnknownProviderError,
  UserMismatchError,
  MissingCredentialsError,
  errorMessage,
} from "../errors.js";
import { logger } from "../logger.js";
import {
  assertStateFresh,
  clearStateCookie,
  readStateCookie,
  verifyState,
} from "../state.js";
import type {
  ClientCredentials,
  OAuthProvider,
  OAuthRouterConfig,
  RequestHandler,
  TokenGrant,
} from "../types.js";
import { extractProvider, postForm } from "./shared.js";

export interface CallbackDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createCallbackHandler(
  config: OAuthRouterConfig,
  deps: CallbackDeps = {},
): RequestHandler {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const stateTtl = config.stateTtlSeconds ?? 600;

  return async (req) => {
    try {
      const providerName = extractProvider(req.url, "callback");
      const adapter: OAuthProvider | undefined = config.providers[providerName];
      if (!adapter) throw new UnknownProviderError(providerName);

      const creds: ClientCredentials | undefined = config.clientCredentials[providerName];
      if (!creds) throw new MissingCredentialsError(providerName);

      const u = new URL(req.url);
      const code = u.searchParams.get("code");
      const stateNonce = u.searchParams.get("state");
      if (!code || !stateNonce) throw new StateMissingError();

      const signed = readStateCookie(req);
      const state = verifyState(signed, config.stateSigningSecret);
      assertStateFresh(state, stateTtl, now());

      if (state.nonce !== stateNonce) throw new StateTamperedError();
      if (state.provider !== providerName) throw new StateTamperedError();

      const userId = await config.resolveUserId(req);
      if (!userId) throw new UnauthenticatedError();
      if (userId !== state.userId) throw new UserMismatchError();

      // Exact-match redirect URI. Some providers echo it back on the callback;
      // where they don't, we still compare against the configured value used in start.
      const echoedRedirect = u.searchParams.get("redirect_uri");
      if (echoedRedirect && echoedRedirect !== creds.redirectUri) {
        throw new RedirectMismatchError(providerName);
      }

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: creds.redirectUri,
      });
      if (adapter.usePkce && state.codeVerifier) {
        body.set("code_verifier", state.codeVerifier);
      }

      const raw = await postForm(fetchImpl, adapter.tokenUrl, body, providerName);
      const grant: TokenGrant = adapter.parseTokenResponse(raw);
      if (!grant.accessToken) {
        throw new ProviderError(providerName, "missing_access_token", "token response missing access_token");
      }

      await config.storage.put(userId, providerName, grant);

      return new Response(null, {
        status: 302,
        headers: {
          location: state.returnTo || "/",
          "set-cookie": clearStateCookie(config.cookieDomain),
        },
      });
    } catch (err) {
      return handleCallbackError(err, config.cookieDomain);
    }
  };
}

function handleCallbackError(err: unknown, cookieDomain?: string): Response {
  const clear = clearStateCookie(cookieDomain);
  if (err instanceof StateTamperedError || err instanceof StateMissingError) {
    logger.warn("callback rejected — state invalid", { code: (err as OAuthError).code });
    return new Response("state_invalid", { status: 400, headers: { "set-cookie": clear } });
  }
  if (err instanceof StateExpiredError) {
    logger.warn("callback rejected — state expired");
    return new Response("state_expired", { status: 400, headers: { "set-cookie": clear } });
  }
  if (err instanceof UserMismatchError) {
    logger.warn("callback rejected — user mismatch");
    return new Response("user_mismatch", { status: 400, headers: { "set-cookie": clear } });
  }
  if (err instanceof RedirectMismatchError) {
    logger.warn("callback rejected — redirect mismatch", { provider: err.provider });
    return new Response("redirect_mismatch", { status: 400, headers: { "set-cookie": clear } });
  }
  if (err instanceof UnauthenticatedError) {
    return new Response("unauthenticated", { status: 401, headers: { "set-cookie": clear } });
  }
  if (err instanceof UnknownProviderError) {
    return new Response(err.message, { status: 404 });
  }
  if (err instanceof ProviderError) {
    logger.warn("callback provider error", { provider: err.provider, code: err.code, status: err.status });
    return new Response(err.code, { status: 502, headers: { "set-cookie": clear } });
  }
  if (err instanceof OAuthError) {
    logger.warn("callback error", { code: err.code, provider: err.provider });
    return new Response(err.code, { status: 400, headers: { "set-cookie": clear } });
  }
  logger.error("callback unexpected error", { error: errorMessage(err) });
  return new Response("internal_error", { status: 500, headers: { "set-cookie": clear } });
}
