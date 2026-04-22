package __JAVA_PKG__.security;

import java.util.Collection;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

/**
 * Authentication token carrying a raw API key before validation, or an
 * authenticated principal name after validation.
 */
public class ApiKeyAuthenticationToken extends AbstractAuthenticationToken {

    private final String principal;
    private final String apiKey;

    /** Unauthenticated — carries just the raw key extracted from the header. */
    public ApiKeyAuthenticationToken(String apiKey) {
        super((Collection<? extends GrantedAuthority>) null);
        this.principal = null;
        this.apiKey = apiKey;
        setAuthenticated(false);
    }

    /** Authenticated — carries the resolved principal and granted authorities. */
    public ApiKeyAuthenticationToken(String principal, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.principal = principal;
        this.apiKey = null;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return apiKey;
    }

    @Override
    public Object getPrincipal() {
        return principal;
    }
}
