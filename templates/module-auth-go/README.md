# module-auth-go

Composable authentication middleware module for Go HTTP services with
pluggable providers. The Go-side analog of `module-auth-ts`.

## What you get

- **Provider registry** — plug in JWT, Auth0, Clerk, Supabase, API key,
  or your own
- **Framework-agnostic middleware** — works with any `net/http` router
  (chi, gorilla/mux, stdlib `ServeMux`)
- **Route guards** — `RequireAuth` (401) and `RequireRole(role)` (403)
- **Five reference providers** — HS256/RS256 JWT with JWKS, Auth0,
  Clerk, Supabase, API key
- **No init side effects** — providers register on explicit call so
  startup order and configuration errors surface cleanly

## Variables

| Variable | Placeholder | Default | Description |
|----------|-------------|---------|-------------|
| `ProjectName` | `__PROJECT_NAME__` | *(required)* | Kebab-case module directory name |
| `GoModule` | `__GO_MODULE__` | `github.com/${Org}/${ProjectName}` | Full Go module path |
| `Org` | `__ORG__` | *(required)* | GitHub organization or username |
| `Description` | `__DESCRIPTION__` | Composable authentication middleware... | Module description |
| `AuthProvider` | `__AUTH_PROVIDER__` | `jwt` | Default provider name |

## Project layout

```text
<ProjectName>/
  auth/
    auth.go                 # User, Config, Result, context helpers
    middleware.go           # net/http middleware factory
    guards.go               # RequireAuth, RequireRole
    providers/
      provider.go           # Provider interface + registry
      register.go           # RegisterBuiltins(name)
      resolver.go           # Registry-backed auth.ProviderResolver
      errors.go             # Sentinel errors
      jwt.go                # JWT (HS256 secret or RS256/ES256 JWKS)
      auth0.go              # Auth0 (JWKS + issuer pinned)
      clerk.go              # Clerk session tokens
      supabase.go           # Supabase JWT
      apikey.go             # API-key header auth
  go.mod
  Makefile
  README.md
  .env.example
```

## Pairs with

- [go-service](../go-service/) — canonical Go HTTP service, stack
  alongside for authentication

## Nests inside

- [monorepo](../monorepo/)
