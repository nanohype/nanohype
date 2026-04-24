# module-spring-security

Drop-in [Spring Security](https://spring.io/projects/spring-security) module for a Spring Boot 3+ service. Ships a production-shaped multi-provider `SecurityFilterChain` supporting **OAuth 2.0 JWT resource server** (OIDC), **header-based API keys** with a pluggable validator, and **opaque-token introspection** — all selectable via `@ConfigurationProperties`, composable simultaneously, dispatching through Spring Security's native `AuthenticationManager`.

Unlike the TypeScript [`module-auth-ts`](../module-auth-ts/), this module doesn't reinvent an `AuthProvider` interface — Spring Security's `AuthenticationManager` + `AuthenticationProvider` surface is already the registry pattern. The module wires those primitives so you inherit the full Spring Security ecosystem (method security, event publishing, session semantics, the OAuth 2.0 client chain, etc.) out of the box.

## What you get

- **`SecurityProperties.java`** — typed `@ConfigurationProperties` at `security.*` with nested blocks for each strategy's knobs (issuer, audience, API key header name, introspection endpoint, etc.)
- **`SecurityConfig.java`** — the main `@Configuration` wiring a `SecurityFilterChain` that simultaneously accepts JWT bearer tokens, API keys, and (optionally) opaque tokens — each gated by its own enabled flag in properties
- **`JwtAuthoritiesConverter.java`** — a `Converter<Jwt, AbstractAuthenticationToken>` that extracts roles from a configurable claim path (e.g. `realm_access.roles` for Keycloak, `https://example.com/roles` for Auth0) and maps them to Spring `GrantedAuthority` instances
- **`ApiKeyAuthenticationFilter.java`** — `OncePerRequestFilter` that pulls the configured header (default `X-API-Key`), constructs an `ApiKeyAuthenticationToken`, and delegates to the shared `AuthenticationManager`
- **`ApiKeyAuthenticationProvider.java`** — an `AuthenticationProvider` that validates tokens via a pluggable `ApiKeyValidator` bean
- **`InMemoryApiKeyValidator.java`** — a default `ApiKeyValidator` implementation backed by a static map in properties (useful for bootstrapping; real deployments swap in a DB or secret-store-backed validator)
- **`MethodSecurityConfig.java`** *(conditional)* — `@EnableMethodSecurity` with `prePostEnabled` so you can use `@PreAuthorize` / `@PostAuthorize` on service methods
- **`TestSecurityConfig.java`** *(conditional)* — `@TestConfiguration` exposing a stub `JwtDecoder` for slice tests that need the security context to load without hitting a real OIDC issuer
- **`SecurityConfigTest.java`** *(conditional)* — verifies the multi-provider filter chain accepts JWT + API-key authentication paths

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | (required) | Kebab-case project name |
| `JavaPackage` | string | `com.example.app` | Root Java package (dot form) |
| `PackageDir` | string | `com/example/app` | Root Java package (slash form) |
| `OidcIssuer` | string | `https://auth.example.com` | Default OIDC issuer (override via env var at runtime) |
| `AllowedAudience` | string | `<ProjectName>` | Default JWT `aud` claim |
| `IncludeMethodSecurity` | bool | `true` | Ship `@EnableMethodSecurity` config |
| `IncludeTests` | bool | `true` | Ship test helpers |

## Project layout

```text
src/main/java/<PackageDir>/security/
  SecurityProperties.java           # @ConfigurationProperties binding
  SecurityConfig.java               # SecurityFilterChain wiring
  JwtAuthoritiesConverter.java      # Claim path → GrantedAuthority
  ApiKeyAuthenticationFilter.java   # Header extraction
  ApiKeyAuthenticationProvider.java # Validation delegation
  ApiKeyAuthenticationToken.java    # Custom Authentication
  ApiKeyValidator.java              # Pluggable validator interface
  InMemoryApiKeyValidator.java      # Default impl, static map
  MethodSecurityConfig.java         # @EnableMethodSecurity (conditional)
src/test/java/<PackageDir>/security/
  TestSecurityConfig.java           # Stub JwtDecoder for slice tests
  SecurityConfigTest.java           # Multi-provider wiring assertions
```

## Required Maven dependencies

Add to your consuming project's `pom.xml`. [`spring-boot-service`](../spring-boot-service/) ships auth-neutral and does **not** include these by default — stack this module and add the deps at the same time.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

For tests (if `IncludeTests=true`):

```xml
<dependency>
    <groupId>org.springframework.security</groupId>
    <artifactId>spring-security-test</artifactId>
    <scope>test</scope>
</dependency>
```

## Runtime configuration

In `application.yaml`:

```yaml
security:
  jwt:
    enabled: true
    issuer-uri: ${SECURITY_JWT_ISSUER_URI:}
    audience: <ProjectName>
    authorities-claim: realm_access.roles
    authorities-prefix: ROLE_
  api-key:
    enabled: false
    header-name: X-API-Key
    keys:
      alice: alice-secret-key
      bob: bob-secret-key
  opaque-token:
    enabled: false
    introspection-uri: ${SECURITY_OPAQUE_INTROSPECTION_URI:}
    client-id: ${SECURITY_OPAQUE_CLIENT_ID:}
    client-secret: ${SECURITY_OPAQUE_CLIENT_SECRET:}
```

## Pairs with

- [spring-boot-service](../spring-boot-service/) — the canonical JVM service template. Until [#72](../../../issues/72) lands, turn off `IncludeAuth` on `spring-boot-service` when using this module to avoid two competing `SecurityFilterChain` beans.
- [istio-policy](../istio-policy/) — mesh-edge JWT enforcement configured against the same issuer. Defense in depth.

## Nests inside

- [monorepo](../monorepo/)
