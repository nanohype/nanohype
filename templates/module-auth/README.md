# module-auth

Composable authentication middleware module with pluggable providers.

## What you get

- **Provider registry** — plug in JWT, Clerk, Auth0, Supabase, API key, or your own
- **Framework-agnostic middleware** — works with both Hono and Express
- **Route guards** — `requireAuth` (401) and `requireRole(role)` (403)
- **Five reference providers** — ready to use, self-registering at import time

## Variables

| Variable | Placeholder | Default | Description |
|----------|-------------|---------|-------------|
| `ProjectName` | `__PROJECT_NAME__` | *(required)* | Kebab-case package name |
| `Description` | `__DESCRIPTION__` | Composable authentication middleware... | Package description |
| `AuthProvider` | `__AUTH_PROVIDER__` | `jwt` | Default auth provider |

## Project layout

```text
<ProjectName>/
  src/
    auth/
      index.ts              # Main export — createAuthMiddleware(config)
      types.ts              # AuthUser, AuthConfig, AuthResult
      middleware.ts          # Framework-agnostic middleware factory
      guards.ts             # requireAuth, requireRole guards
      providers/
        types.ts            # AuthProvider interface
        registry.ts         # Provider registry
        jwt.ts              # JWT validation (jose)
        clerk.ts            # Clerk (@clerk/backend)
        auth0.ts            # Auth0 (jose + JWKS)
        supabase.ts         # Supabase Auth (@supabase/supabase-js)
        apikey.ts           # API key validation
        index.ts            # Barrel import + re-exports
      __tests__/
        registry.test.ts
        guards.test.ts
        jwt.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) -- add auth middleware to a TypeScript HTTP service
- [mcp-server-ts](../mcp-server-ts/) -- protect MCP server endpoints

## Nests inside

- [monorepo](../monorepo/)

## Quick start

```typescript
import { createAuthMiddleware, requireAuth, requireRole } from "your-auth-module";

import { Hono } from "hono";
const app = new Hono();

app.use("/api/*", createAuthMiddleware({ provider: "jwt" }));
app.get("/api/profile", requireAuth, (c) => {
  const user = c.get("authUser");
  return c.json({ user });
});
app.get("/api/admin", requireAuth, requireRole("admin"), (c) => {
  return c.json({ message: "admin access granted" });
});
```

## Providers

Each provider reads its configuration from environment variables:

| Provider | Environment Variables |
|----------|---------------------|
| `jwt` | `AUTH_JWT_SECRET` or `AUTH_JWT_JWKS_URL`, optional `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` |
| `clerk` | `CLERK_SECRET_KEY` |
| `auth0` | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` |
| `supabase` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `apikey` | `AUTH_API_KEYS` (comma-separated, format: `key:role1+role2:label`) |

## Adding a custom provider

```typescript
import { registerProvider } from "your-auth-module/providers";
import type { AuthProvider } from "your-auth-module/providers";

const myProvider: AuthProvider = {
  name: "custom",
  async verifyRequest(request) {
    return { authenticated: true, user: { id: "1", roles: [], metadata: {} } };
  },
};

registerProvider(myProvider);
```
