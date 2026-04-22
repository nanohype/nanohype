package __JAVA_PKG__.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Unit-level coverage for the security module's core moving parts:
 * JWT authority extraction (nested claim paths and flat string scopes)
 * and API-key provider dispatch. Exercises logic directly without
 * booting a full Spring context — context-level wiring is covered
 * implicitly by the consuming service's integration tests.
 */
class SecurityConfigTest {

    @Test
    void jwtConverterExtractsNestedClaim() {
        SecurityProperties props = new SecurityProperties();
        props.getJwt().setAuthoritiesClaim("realm_access.roles");
        props.getJwt().setAuthoritiesPrefix("ROLE_");

        Jwt jwt = Jwt.withTokenValue("t").header("alg", "RS256")
            .claim("realm_access", Map.of("roles", List.of("admin", "reader")))
            .build();

        Collection<? extends GrantedAuthority> authorities =
            new JwtAuthoritiesConverter(props).convert(jwt).getAuthorities();

        assertThat(authorities).extracting(GrantedAuthority::getAuthority)
            .containsExactlyInAnyOrder("ROLE_admin", "ROLE_reader");
    }

    @Test
    void jwtConverterSplitsSpaceSeparatedScopes() {
        SecurityProperties props = new SecurityProperties();
        props.getJwt().setAuthoritiesClaim("scope");
        props.getJwt().setAuthoritiesPrefix("SCOPE_");

        Jwt jwt = Jwt.withTokenValue("t").header("alg", "RS256")
            .claim("scope", "read write admin")
            .build();

        Collection<? extends GrantedAuthority> authorities =
            new JwtAuthoritiesConverter(props).convert(jwt).getAuthorities();

        assertThat(authorities).extracting(GrantedAuthority::getAuthority)
            .containsExactlyInAnyOrder("SCOPE_read", "SCOPE_write", "SCOPE_admin");
    }

    @Test
    void jwtConverterReturnsEmptyForMissingClaim() {
        SecurityProperties props = new SecurityProperties();
        props.getJwt().setAuthoritiesClaim("missing.path");

        Jwt jwt = Jwt.withTokenValue("t").header("alg", "RS256")
            .claim("realm_access", Map.of("roles", List.of("admin")))
            .build();

        Collection<? extends GrantedAuthority> authorities =
            new JwtAuthoritiesConverter(props).convert(jwt).getAuthorities();

        assertThat(authorities).isEmpty();
    }

    @Test
    void apiKeyProviderAcceptsValidKey() {
        ApiKeyValidator validator = key -> "alice".equals(key) ? java.util.Optional.of("alice-principal") : java.util.Optional.empty();
        ApiKeyAuthenticationProvider provider = new ApiKeyAuthenticationProvider(validator);

        Authentication result = provider.authenticate(new ApiKeyAuthenticationToken("alice"));

        assertThat(result.isAuthenticated()).isTrue();
        assertThat(result.getPrincipal()).isEqualTo("alice-principal");
        assertThat(result.getAuthorities()).extracting(GrantedAuthority::getAuthority)
            .containsExactly("ROLE_API_KEY");
    }

    @Test
    void apiKeyProviderRejectsInvalidKey() {
        ApiKeyValidator validator = key -> java.util.Optional.empty();
        ApiKeyAuthenticationProvider provider = new ApiKeyAuthenticationProvider(validator);

        try {
            provider.authenticate(new ApiKeyAuthenticationToken("bogus"));
            throw new AssertionError("Expected BadCredentialsException");
        } catch (BadCredentialsException expected) {
            assertThat(expected.getMessage()).contains("Invalid API key");
        }
    }

    @Test
    void apiKeyProviderSupportsOnlyApiKeyToken() {
        ApiKeyAuthenticationProvider provider =
            new ApiKeyAuthenticationProvider(key -> java.util.Optional.empty());

        assertThat(provider.supports(ApiKeyAuthenticationToken.class)).isTrue();
        assertThat(provider.supports(TestingAuthenticationToken.class)).isFalse();
    }
}
