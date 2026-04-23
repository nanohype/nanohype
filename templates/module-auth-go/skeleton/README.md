# __PROJECT_NAME__

__DESCRIPTION__

Module path: [github.com/__ORG__/__PROJECT_NAME__](https://github.com/__ORG__/__PROJECT_NAME__)

A framework-agnostic auth layer for Go HTTP services. Plug in a provider
(JWT, Auth0, Clerk, Supabase, API key, or a custom one) and apply the
resulting middleware to any `net/http`-compatible router — chi,
gorilla/mux, stdlib `ServeMux`, or others.

## What you get

- **Provider registry** — plug in JWT, Auth0, Clerk, Supabase, API key,
  or your own implementation
- **Framework-agnostic middleware** — works with any `net/http` router
- **Route guards** — `RequireAuth` (401) and `RequireRole("admin")` (403)
- **Five reference providers** — ready to use, selected by name at startup
- **Zero magic** — no reflection, no init side effects; register
  providers yourself when the process is ready

## Quick start

```go
package main

import (
    "log"
    "net/http"

    "__GO_MODULE__/auth"
    "__GO_MODULE__/auth/providers"
)

func main() {
    if err := providers.RegisterBuiltins("__AUTH_PROVIDER__"); err != nil {
        log.Fatalf("auth: %v", err)
    }

    mw, err := auth.Middleware(
        auth.Config{Provider: "__AUTH_PROVIDER__"},
        providers.Resolver(),
    )
    if err != nil {
        log.Fatalf("auth middleware: %v", err)
    }

    mux := http.NewServeMux()
    mux.Handle("/api/profile", mw(auth.RequireAuth(http.HandlerFunc(profile))))
    mux.Handle("/api/admin",   mw(auth.RequireAuth(auth.RequireRole("admin")(http.HandlerFunc(adminOnly)))))

    log.Fatal(http.ListenAndServe(":8080", mux))
}

func profile(w http.ResponseWriter, r *http.Request) {
    u, _ := auth.FromContext(r.Context())
    _, _ = w.Write([]byte("hello " + u.ID))
}

func adminOnly(w http.ResponseWriter, _ *http.Request) {
    _, _ = w.Write([]byte("admin"))
}
```

## Providers

Each built-in provider is wired from environment variables. See
`.env.example` for the full list.

| Provider | Environment variables |
|----------|-----------------------|
| `jwt` | `AUTH_JWT_SECRET` (HS256) **or** `AUTH_JWT_JWKS_URL` (RS256/ES256); optional `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` |
| `auth0` | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` |
| `clerk` | `CLERK_FRONTEND_API`; optional `CLERK_AUDIENCE` |
| `supabase` | `SUPABASE_JWT_SECRET` |
| `apikey` | `AUTH_API_KEYS` (comma-separated, format: `key[:role1+role2][:label]`) |

### Adding a custom provider

```go
import (
    "net/http"

    "__GO_MODULE__/auth"
    "__GO_MODULE__/auth/providers"
)

type myProvider struct{}

func (myProvider) Name() string { return "custom" }

func (myProvider) VerifyRequest(r *http.Request) auth.Result {
    // Your validation logic.
    return auth.Result{Authenticated: true, User: &auth.User{ID: "u-1"}}
}

func init() {
    providers.Register(myProvider{})
}
```

Register it before constructing the middleware. Then pass `"custom"` as
the provider name.

## Project layout

```text
__PROJECT_NAME__/
  auth/
    auth.go                  # User, Config, Result, context helpers
    middleware.go            # net/http middleware factory
    guards.go                # RequireAuth, RequireRole
    providers/
      provider.go            # Provider interface + registry
      register.go            # RegisterBuiltins(name)
      resolver.go            # Registry-backed auth.ProviderResolver
      errors.go              # Sentinel errors
      jwt.go                 # HMAC secret or JWKS-verifier
      auth0.go               # Auth0 (JWKS + issuer pinned)
      clerk.go               # Clerk session tokens (JWKS)
      supabase.go            # Supabase JWT (HS256 shared secret)
      apikey.go              # API key header auth
  go.mod
  Makefile
  README.md
  .env.example
  .gitignore
```

## Pairs with

- [go-service](../go-service/) — canonical Go HTTP service, stack this
  module alongside for authentication
- [infra-fly](../infra-fly/), [infra-aws](../infra-aws/) — deployment
  targets

## Nests inside

- [monorepo](../monorepo/)

## Design notes

- **No package init side effects.** Providers register on explicit call
  rather than import so startup order and failure surfaces are under
  your control. A misconfigured JWKS URL or missing secret shows up as
  an error at boot, not a silent 401 later.
- **Issuer and audience are validated when configured.** Unset checks
  are skipped intentionally — the module matches the behavior of the
  upstream JWT library rather than inventing stricter defaults.
- **Constant-time comparisons** guard the API-key path to avoid leaking
  key prefixes via timing.
- **The providers package depends on the auth package**, not the other
  way around. This keeps the surface the middleware imports minimal and
  avoids import cycles when consumers add custom providers.
