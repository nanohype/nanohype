package __JAVA_PKG__.security;

import java.time.Instant;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Provides a stub JwtDecoder so slice tests load the security context
 * without hitting a real OIDC issuer. Any presented token is accepted
 * and decoded to a JWT carrying a minimal set of claims — authentication
 * in tests is typically set up via SecurityMockMvcRequestPostProcessors
 * (e.g. `.with(jwt())`) which constructs the Jwt directly and bypasses
 * the decoder.
 *
 * Import into slice tests with @Import(TestSecurityConfig.class).
 */
@TestConfiguration
public class TestSecurityConfig {

    @Bean
    @Primary
    JwtDecoder stubJwtDecoder() {
        return token -> Jwt.withTokenValue(token)
            .header("alg", "none")
            .subject("test-user")
            .issuer("https://test.invalid")
            .claim("scope", "read write")
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(300))
            .build();
    }
}
