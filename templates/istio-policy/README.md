# istio-policy

Scaffolds an Istio service-mesh policy bundle for an HTTP workload: JWT authentication via `RequestAuthentication`, claim-based authorization via `AuthorizationPolicy`, optional STRICT mTLS via `PeerAuthentication`, and an optional `VirtualService` routing template.

Drops alongside any containerized service — pairs naturally with [spring-boot-service](../spring-boot-service/), [go-service](../go-service/), or [ts-service](../ts-service/).

## What you get

- **`request-authentication.yaml`** — configures the JWT issuer + JWKs endpoint so the sidecar decodes incoming tokens and exposes their claims to the authorization layer. Requests without a valid token proceed without an authenticated principal (the AuthorizationPolicy decides what to do with them).
- **`authorization-policy.yaml`** — enforces that inbound traffic carries a JWT issued by the configured issuer with the expected audience. Blocks unauthenticated requests at the sidecar, before they reach the application.
- **`peer-authentication.yaml`** *(conditional)* — enforces STRICT mTLS between sidecars in the namespace. Only turn this on once every workload in the namespace has a sidecar; in STRICT mode, non-mTLS traffic is rejected.
- **`virtual-service.yaml`** *(conditional)* — routing template attached to either the internal mesh (`gateways: [mesh]`) or an external Istio gateway. Ships with a single catch-all route; add path-based splits or traffic shifting as needed.

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name; drives resource names and selector labels |
| `Namespace` | string | `default` | Kubernetes namespace |
| `OidcIssuer` | string | (required) | OIDC issuer URL that signs inbound JWTs |
| `JwksUri` | string | `<OidcIssuer>/.well-known/jwks.json` | JWKs endpoint URL |
| `AllowedAudience` | string | `<ProjectName>` | Required JWT `aud` claim value |
| `ServiceHost` | string | `<ProjectName>.<Namespace>.svc.cluster.local` | Fully-qualified service host (for VirtualService) |
| `GatewayName` | string | `mesh` | Gateway the VirtualService attaches to (`mesh` = internal-only) |
| `IncludeMTls` | bool | `false` | Ship a STRICT PeerAuthentication |
| `IncludeVirtualService` | bool | `false` | Ship a VirtualService |

## Project layout

```text
istio/
  authorization-policy.yaml    # Deny-by-default; allow authenticated callers
  request-authentication.yaml  # JWT issuer + JWKs endpoint
  peer-authentication.yaml     # STRICT mTLS (conditional)
  virtual-service.yaml         # Routing template (conditional)
  README.md
```

## Pairs with

- [spring-boot-service](../spring-boot-service/) — enable Spring Security OAuth 2.0 resource server with the same `OidcIssuer` to get defense-in-depth (mesh validates, app validates again)
- [go-service](../go-service/) — pair with any JWT middleware on the app side
- [ts-service](../ts-service/) — same
- [k8s-deploy](../k8s-deploy/) — deploys the workload; this template layers mesh policy on top

## Nests inside

- [monorepo](../monorepo/)
