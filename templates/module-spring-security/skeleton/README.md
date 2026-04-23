# __PROJECT_NAME__ — Spring Security module

Multi-provider Spring Security configuration for __PROJECT_NAME__. Authenticates requests via any combination of:

1. **OAuth 2.0 JWT resource server** (OIDC) — default on
2. **Header-based API keys** with a pluggable validator — default off
3. **Opaque-token introspection** (RFC 7662) — default off

Each strategy is independently toggled at runtime via `security.*` properties. All three can be enabled simultaneously; Spring Security's `AuthenticationManager` dispatches to whichever provider handles the presented credential.

## Configuration

Add to `application.yaml`:

```yaml
security:
  jwt:
    enabled: true
    issuer-uri: ${SECURITY_JWT_ISSUER_URI:__OIDC_ISSUER__}
    audience: __ALLOWED_AUD__
    authorities-claim: scope
    authorities-prefix: SCOPE_
  api-key:
    enabled: false
    header-name: X-API-Key
    keys:
      service-alice: alice-secret-key-rotate-me
      service-bob: bob-secret-key-rotate-me
  opaque-token:
    enabled: false
    introspection-uri: ${SECURITY_OPAQUE_INTROSPECTION_URI:}
    client-id: ${SECURITY_OPAQUE_CLIENT_ID:}
    client-secret: ${SECURITY_OPAQUE_CLIENT_SECRET:}
```

## JWT

The JWT strategy validates bearer tokens against an OIDC issuer. Spring Boot auto-discovers the JWKs endpoint from `issuer-uri` via the `.well-known/openid-configuration` document — override with `jwk-set-uri` if your provider uses a non-standard layout.

**Authority mapping.** `authorities-claim` supports dot-separated paths for providers that nest roles (Keycloak: `realm_access.roles`, Auth0 with a custom action: `https://<namespace>/roles`). Collection values are extracted element-wise; space-separated string claims (like the default OAuth 2.0 `scope`) are split on whitespace. `authorities-prefix` is prepended to every extracted value before registering it as a `GrantedAuthority`.

## API key

Keys are extracted from the configured header (default `X-API-Key`) and validated by a bean implementing `ApiKeyValidator`. The default in-memory validator reads from `security.api-key.keys` — keys in configuration are only appropriate for local development and bootstrapping. For production, provide a bean backed by a database, AWS Secrets Manager, Vault, or a dedicated auth service; `@ConditionalOnMissingBean` on `InMemoryApiKeyValidator` means your replacement wins automatically.

Successful API-key auth grants `ROLE_API_KEY` — combine with `@PreAuthorize("hasRole('API_KEY')")` to scope endpoints that only machine callers should hit.

## Opaque token

For issuers that mint opaque (non-JWT) tokens, set `opaque-token.enabled=true` and provide the RFC 7662 introspection endpoint + client credentials. Each request triggers an introspection call — consider caching (Spring Security ships a `NimbusOpaqueTokenIntrospector` that uses standard HTTP caching headers when the issuer honors them).

## Method security

`@EnableMethodSecurity` is configured by default so `@PreAuthorize` / `@PostAuthorize` work on service-layer methods. Authority names from all three strategies flow into the same SecurityContext, so:

```java
@PreAuthorize("hasAuthority('SCOPE_orders:write') or hasRole('API_KEY')")
Order createOrder(OrderRequest request) { ... }
```

## Testing

`TestSecurityConfig` provides a stub `JwtDecoder` for `@WebMvcTest` slices. Use it alongside `spring-security-test`'s `.with(jwt())` post-processor:

```java
@WebMvcTest(OrdersController.class)
@Import(TestSecurityConfig.class)
class OrdersControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void createsOrderWithValidJwt() throws Exception {
        mvc.perform(post("/api/v1/orders")
                .with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_orders:write")))
                .contentType(APPLICATION_JSON)
                .content("{ ... }"))
            .andExpect(status().isCreated());
    }
}
```

## Pairs with

- **spring-boot-service** — turn off the service template's `IncludeAuth` when using this module (two competing `SecurityFilterChain` beans otherwise; tracked in catalog issue #72)
- **istio-policy** — configure the Istio mesh with the same `OidcIssuer` for defense-in-depth JWT validation at the mesh edge as well as the app
