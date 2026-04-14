# module-oauth-delegation

Composable **outbound** OAuth 2.0 delegation module — stores per-user access tokens and calls third-party APIs on the user's behalf.

> **Not inbound auth.** Use [module-auth](../module-auth/) to verify incoming requests. Use this module when your service needs to call Notion, Google, Atlassian, Slack, or HubSpot *as the user*.

## What you get

- **Four HTTP handlers** — `/oauth/:provider/start`, `/oauth/:provider/callback`, `/oauth/:provider/refresh`, `/oauth/:provider/revoke`
- **Authorization Code + PKCE (S256)** — PKCE is always on by default, including for providers that also take a client secret
- **HMAC-signed stateless state cookie** — `HttpOnly; Secure; SameSite=Lax`, 10-minute TTL, tamper detection via `timingSafeEqual`
- **Pluggable token storage** — ships `InMemoryTokenStorage` for tests and `DDBKmsTokenStorage` for production (DynamoDB + KMS envelope encryption with a user+provider-bound encryption context)
- **Automatic refresh** — `getValidToken()` checks expiry with a lead time and refreshes transparently; per-key mutex prevents thundering herd within a single process
- **Five provider adapters** — Notion, Google, Atlassian, Slack, HubSpot
- **Framework-neutral** — handlers take Web-standard `Request` and return `Response`; wire to Hono, Express, Lambda, or raw `node:http` with thin adapters
- **Safe logging** — a hard-coded redaction list prevents access/refresh tokens from ever reaching log output, enforced by a unit test

## Variables

| Variable | Placeholder | Default | Description |
|----------|-------------|---------|-------------|
| `ProjectName` | `__PROJECT_NAME__` | *(required)* | Kebab-case package name |
| `Description` | `__DESCRIPTION__` | Per-user OAuth 2.0 delegation... | Package description |

## Project layout

```text
<ProjectName>/
  src/
    oauth/
      index.ts               # createOAuthRouter + public re-exports
      types.ts               # TokenGrant, OAuthProvider, OAuthRouterConfig, ...
      router.ts              # factory — wires handlers + getValidToken
      state.ts               # HMAC-signed state cookie encode/decode
      pkce.ts                # code_verifier + S256 code_challenge
      refresh.ts             # refresh-before-expiry + per-key mutex
      errors.ts              # typed errors — no token material in messages
      logger.ts              # JSON logger with token-field redaction
      handlers/
        start.ts
        callback.ts
        refresh.ts
        revoke.ts
      providers/
        types.ts             # OAuthProvider interface
        registry.ts          # registerProvider / getProvider / listProviders
        index.ts             # barrel — side-effect imports
        notion.ts
        google.ts
        atlassian.ts
        slack.ts
        hubspot.ts
      storage/
        types.ts             # TokenStorage interface
        memory.ts            # InMemoryTokenStorage
        ddb-kms.ts           # DDBKmsTokenStorage (peer-dep AWS SDK)
      __tests__/
        ...
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) — attach OAuth handlers to a TypeScript HTTP service
- [mcp-server-ts](../mcp-server-ts/) — let an MCP server call third-party APIs as the connected user

## Nests inside

- [monorepo](../monorepo/)

## Quick start

```typescript
import {
  createOAuthRouter,
  notionProvider,
  googleProvider,
  InMemoryTokenStorage,
} from "your-oauth-module";

const router = createOAuthRouter({
  providers: {
    notion: notionProvider,
    google: googleProvider,
  },
  storage: new InMemoryTokenStorage(),
  stateSigningSecret: process.env.OAUTH_STATE_SIGNING_SECRET!,
  resolveUserId: async (req) => {
    // plug in your inbound auth — e.g., module-auth's getAuthUser()
    return req.headers.get("x-user-id");
  },
  clientCredentials: {
    notion: {
      clientId: process.env.NOTION_CLIENT_ID!,
      clientSecret: process.env.NOTION_CLIENT_SECRET!,
      redirectUri: process.env.NOTION_REDIRECT_URI!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    },
  },
});

// In steady state, consumer code calls one thing:
const accessToken = await router.getValidToken(userId, "notion");
if (accessToken) {
  await fetch("https://api.notion.com/v1/users/me", {
    headers: { Authorization: `Bearer ${accessToken}`, "Notion-Version": "2022-06-28" },
  });
}

// Wire handlers to your framework (example: raw node:http pattern)
// app.all("/oauth/*", (req) => router.handlers.start(req) /* or dispatch by path */);
```

## Providers

Each adapter is a plain `OAuthProvider` object that self-registers at import time.

| Provider | Auth URL | Notes |
|----------|----------|-------|
| `notion` | `api.notion.com/v1/oauth/authorize` | No refresh tokens — grants are long-lived |
| `google` | `accounts.google.com/o/oauth2/v2/auth` | Sends `access_type=offline&prompt=consent` on first grant for refresh; reuses refresh token if response omits it |
| `atlassian` | `auth.atlassian.com/authorize` | Adds `audience=api.atlassian.com` |
| `slack` | `slack.com/oauth/v2/authorize` | Reads `authed_user.access_token` for user-scope flows |
| `hubspot` | `app.hubspot.com/oauth/authorize` | Space-separated scopes |

## Storage backends

| Backend | Use case | Persistence | Encryption |
|---------|----------|-------------|------------|
| `InMemoryTokenStorage` | Tests, local dev | Process memory | None |
| `DDBKmsTokenStorage` | Production | DynamoDB | KMS envelope, `EncryptionContext: { purpose, userId, provider }` |

`DDBKmsTokenStorage` depends on `@aws-sdk/client-dynamodb`, `@aws-sdk/client-kms`, and `@smithy/node-http-handler` as **optional peer dependencies** — install them only if you use this backend. DynamoDB key schema: PK `userId`, SK `provider`. The KMS `EncryptionContext` binds each ciphertext to its user/provider pair, so a leaked blob cannot be decrypted for a different user.

## Security model

1. **PKCE is always on** (S256). The `code_verifier` lives in the signed state cookie — no server-side state table.
2. **State cookie is HMAC-SHA256 signed** with a server secret. Tampering or expiry (default 10 min) yields a 400.
3. **Callback verifies `state.userId === resolveUserId(req)`** — the consumer-injected hook that identifies the authenticated caller.
4. **No token material in logs or errors.** A unit test asserts the logger redaction rules hold.
5. **KMS EncryptionContext binds ciphertexts** to `{ purpose, userId, provider }` in the production storage backend.
6. **Refresh failures do not retry.** One attempt — on failure, the token is deleted, a revocation event fires with `reason: "refresh-failed"`, and `getValidToken` returns `null`.
7. **Redirect URIs are exact-match.** Configured per-provider; mismatches reject at callback.

### Known limitation — multi-instance refresh dedup

The per-key mutex deduplicates concurrent refreshes within a single Node.js process. Multi-instance deployments may race; inject a shared-state mutex (Redis, for instance) via the `createOAuthRouter` seam if that matters for your throughput.

## Consumer escape hatch — `readStatePayloadUnverified`

Some consumers have a signed `/start` URL as their only caller-identity signal, with no parallel session on the `/callback` side. Their `resolveUserId` needs to answer both cases:

```typescript
import { readStatePayloadUnverified, type ResolveUserId } from "your-oauth-module";

const resolveUserId: ResolveUserId = async (req) => {
  const url = new URL(req.url);
  const signedToken = url.searchParams.get("t");
  if (signedToken) return verifyMySignedToken(signedToken); // /start

  // /callback — no signed URL token present. Fall back to the cookie.
  const cookie = req.headers.get("cookie") ?? "";
  const payload = readStatePayloadUnverified(cookie);
  return payload?.userId ?? null;
};
```

`readStatePayloadUnverified` parses the cookie **without** checking the HMAC — it is a routing aid, not an authorization signal. The module's callback handler re-verifies via `verifyState` before trusting anything in the payload, so a forged cookie is caught there. The `Unverified` suffix is deliberate: do not use the returned payload to make access decisions.

## module-auth vs module-oauth-delegation

| | `module-auth` | `module-oauth-delegation` |
|---|---|---|
| Direction | Inbound — verify requests | Outbound — call APIs on user's behalf |
| Question answered | "Is this request authenticated?" | "Can we call Notion as this user?" |
| State | Request-scoped (no storage) | Durable per-(userId, provider) row |
| Surface | Middleware + `requireAuth`/`requireRole` guards | Four handlers + `getValidToken()` |
| Providers | JWT, Clerk, Auth0, Supabase, API key | Notion, Google, Atlassian, Slack, HubSpot |

Most services want both: `module-auth` to decide who's calling, `module-oauth-delegation` to call downstream services on their behalf.

## Adding a custom provider

```typescript
import { registerProvider } from "your-oauth-module/providers";
import type { OAuthProvider } from "your-oauth-module";

const githubProvider: OAuthProvider = {
  name: "github",
  authUrl:
    "https://github.com/login/oauth/authorize" +
    "?client_id={client_id}&redirect_uri={redirect_uri}&scope={scope}&state={state}" +
    "&code_challenge={code_challenge}&code_challenge_method={code_challenge_method}",
  tokenUrl: "https://github.com/login/oauth/access_token",
  revokeUrl: undefined,
  defaultScopes: ["repo", "read:user"],
  usePkce: true,
  parseTokenResponse(raw) {
    const r = raw as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expiresAt: r.expires_in ? Math.floor(Date.now() / 1000) + r.expires_in : undefined,
    };
  },
};

registerProvider("github", () => githubProvider);
```
