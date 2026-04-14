# __PROJECT_NAME__

__DESCRIPTION__

Outbound OAuth 2.0 delegation with Authorization Code + PKCE, HMAC-signed state cookies, pluggable per-user token storage, and automatic refresh-before-expiry. Ships reference adapters for Notion, Google, Atlassian, Slack, and HubSpot.

## Getting Started

```sh
npm install
npm run build
npm test
```

## Usage

```ts
import {
  createOAuthRouter,
  notionProvider,
  googleProvider,
  InMemoryTokenStorage,
} from "__PROJECT_NAME__";

const router = createOAuthRouter({
  providers: { notion: notionProvider, google: googleProvider },
  storage: new InMemoryTokenStorage(),
  stateSigningSecret: process.env.OAUTH_STATE_SIGNING_SECRET!,
  resolveUserId: async (req) => req.headers.get("x-user-id"),
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

// The one call most downstream code makes:
const token = await router.getValidToken(userId, "notion");
```

### Wiring to a framework

The handlers take a Web-standard `Request` and return a `Response`. For Hono:

```ts
import { Hono } from "hono";
const app = new Hono();
app.get("/oauth/:provider/start", (c) => router.handlers.start(c.req.raw));
app.get("/oauth/:provider/callback", (c) => router.handlers.callback(c.req.raw));
app.post("/oauth/:provider/refresh", (c) => router.handlers.refresh(c.req.raw));
app.post("/oauth/:provider/revoke", (c) => router.handlers.revoke(c.req.raw));
```

For Express, adapt via `@whatwg-node/server` or similar — the module does not depend on any framework.

## Providers

Built-in adapters self-register on import. Consumers pass the ones they want in `config.providers`.

| Adapter | Refresh tokens | Notes |
|---------|----------------|-------|
| `notionProvider` | No | Notion tokens don't expire |
| `googleProvider` | Yes | `access_type=offline&prompt=consent` |
| `atlassianProvider` | Yes | `audience=api.atlassian.com` |
| `slackProvider` | Yes | Reads `authed_user.access_token` |
| `hubspotProvider` | Yes | Space-separated scopes |

Add a custom provider by calling `registerProvider("name", factoryFn)`.

## Storage backends

- **`InMemoryTokenStorage`** — tests, local dev. No persistence.
- **`DDBKmsTokenStorage`** — production. DynamoDB with KMS envelope encryption. `EncryptionContext` is bound to `{ purpose, userId, provider }` so leaked blobs cannot be decrypted cross-user.

The AWS SDK packages are declared as **optional peer dependencies**. Install them only if you use `DDBKmsTokenStorage`:

```sh
npm install @aws-sdk/client-dynamodb @aws-sdk/client-kms @smithy/node-http-handler
```

## Security

- PKCE (S256) is always on. The `code_verifier` lives in the signed state cookie — no server-side state table.
- The state cookie uses HMAC-SHA256 with a 10-minute TTL and `timingSafeEqual` comparison.
- The callback rejects if `state.userId` doesn't match `resolveUserId(req)`.
- Access and refresh tokens are redacted before they reach the logger.
- Refresh failures do not retry — the token is deleted, a revocation event fires with `reason: "refresh-failed"`, and `getValidToken` returns `null`.

## Environment variables

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `OAUTH_STATE_SIGNING_SECRET` | always | HMAC-SHA256 key for the signed state cookie. Use `openssl rand -base64 48` |
| `<PROVIDER>_CLIENT_ID` | per enabled provider | OAuth client ID (one set per provider you wire in) |
| `<PROVIDER>_CLIENT_SECRET` | per enabled provider | OAuth client secret |
| `<PROVIDER>_REDIRECT_URI` | per enabled provider | Exact-match redirect URI registered with the provider |
| `AWS_REGION` | DDBKms only | Region for DynamoDB + KMS clients |
| `OAUTH_TOKEN_TABLE` | DDBKms only | DynamoDB table name — PK `userId` (S), SK `provider` (S) |
| `OAUTH_KMS_KEY_ID` | DDBKms only | KMS key ID or alias used for envelope encryption |

Full template with commented examples per provider lives in `.env.example`.

## Project Structure

```text
src/
  oauth/
    index.ts
    types.ts
    router.ts
    state.ts
    pkce.ts
    refresh.ts
    errors.ts
    logger.ts
    handlers/
      start.ts
      callback.ts
      refresh.ts
      revoke.ts
    providers/
      types.ts
      registry.ts
      index.ts
      notion.ts
      google.ts
      atlassian.ts
      slack.ts
      hubspot.ts
    storage/
      types.ts
      memory.ts
      ddb-kms.ts
    __tests__/
      state.test.ts
      pkce.test.ts
      refresh.test.ts
      router.test.ts
      logger-redaction.test.ts
      providers/
        notion.test.ts
        google.test.ts
        atlassian.test.ts
        slack.test.ts
        hubspot.test.ts
      storage/
        memory.test.ts
        ddb-kms.test.ts
```
