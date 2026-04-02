# __PROJECT_NAME__

__DESCRIPTION__

A composable authentication middleware module with pluggable providers, compatible with Hono and Express.

## Getting Started

```bash
npm install
npm run build
```

## Usage

### Basic setup

```ts
import { createAuthMiddleware, requireAuth, requireRole } from "__PROJECT_NAME__";
```

### With Hono

```ts
import { Hono } from "hono";

const app = new Hono();

// Apply auth middleware to all /api routes
app.use("/api/*", createAuthMiddleware({ provider: "__AUTH_PROVIDER__" }));

// Public route — no auth required
app.get("/health", (c) => c.json({ status: "ok" }));

// Protected route — requires authentication
app.get("/api/profile", requireAuth, (c) => {
  const user = c.get("authUser");
  return c.json({ user });
});

// Role-restricted route — requires "admin" role
app.get("/api/admin", requireAuth, requireRole("admin"), (c) => {
  return c.json({ message: "admin access granted" });
});
```

### With Express

```ts
import express from "express";

const app = express();

// Apply auth middleware to all /api routes
app.use("/api", createAuthMiddleware({ provider: "__AUTH_PROVIDER__" }));

// Protected route
app.get("/api/profile", requireAuth, (req, res) => {
  res.json({ user: req.authUser });
});

// Role-restricted route
app.get("/api/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ message: "admin access granted" });
});
```

## Providers

Configure providers via environment variables:

| Provider | Variables |
|----------|-----------|
| `jwt` | `AUTH_JWT_SECRET` or `AUTH_JWT_JWKS_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` |
| `clerk` | `CLERK_SECRET_KEY` |
| `auth0` | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` |
| `supabase` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `apikey` | `AUTH_API_KEYS` (format: `key:role1+role2:label,...`) |

## Custom Providers

```ts
import { registerProvider } from "__PROJECT_NAME__/providers";
import type { AuthProvider } from "__PROJECT_NAME__/providers";

const myProvider: AuthProvider = {
  name: "custom",
  async verifyRequest(request) {
    // Extract and verify credentials from request.headers
    return {
      authenticated: true,
      user: { id: "user-1", roles: ["user"], metadata: {} },
    };
  },
};

registerProvider(myProvider);
```

## Project Structure

```
src/
  auth/
    index.ts              # Main entry point and re-exports
    types.ts              # Core type definitions
    middleware.ts          # Framework-agnostic middleware factory
    guards.ts             # Route guard helpers
    providers/
      types.ts            # AuthProvider interface
      registry.ts         # Provider registry
      jwt.ts              # JWT validation provider
      clerk.ts            # Clerk provider
      auth0.ts            # Auth0 provider
      supabase.ts         # Supabase Auth provider
      apikey.ts           # API key validation provider
      index.ts            # Barrel exports
```
