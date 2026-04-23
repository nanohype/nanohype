package __JAVA_PKG__.security;

import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Delegates API key validation to the ApiKeyValidator bean in the
 * application context. Swap the validator implementation to back
 * validation with a database, secret store, or external auth service.
 *
 * Instantiated as a @Bean by SecurityConfig, gated on the API-key
 * strategy being enabled — when disabled, this class is never loaded.
 */
public class ApiKeyAuthenticationProvider implements AuthenticationProvider {

    private final ApiKeyValidator validator;

    public ApiKeyAuthenticationProvider(ApiKeyValidator validator) {
        this.validator = validator;
    }

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        String rawKey = (String) authentication.getCredentials();
        Optional<String> principal = validator.validate(rawKey);
        return principal
            .map(name -> (Authentication) new ApiKeyAuthenticationToken(
                name, List.of(new SimpleGrantedAuthority("ROLE_API_KEY"))))
            .orElseThrow(() -> new BadCredentialsException("Invalid API key"));
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return ApiKeyAuthenticationToken.class.isAssignableFrom(authentication);
    }
}
