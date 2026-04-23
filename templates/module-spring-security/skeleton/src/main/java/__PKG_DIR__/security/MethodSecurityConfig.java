package __JAVA_PKG__.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

/**
 * Enables @PreAuthorize / @PostAuthorize on service-layer methods.
 * Authority checks integrate with the authorities produced by
 * JwtAuthoritiesConverter and the ROLE_API_KEY authority granted by
 * ApiKeyAuthenticationProvider — so `@PreAuthorize("hasRole('ADMIN')")`
 * works uniformly regardless of which authentication strategy
 * populated the SecurityContext.
 */
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig {
}
