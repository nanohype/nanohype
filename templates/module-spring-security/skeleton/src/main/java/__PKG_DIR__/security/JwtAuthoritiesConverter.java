package __JAVA_PKG__.security;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Extracts authorities from a configurable JWT claim path and wraps them
 * in a JwtAuthenticationToken. Supports nested claim paths
 * (e.g. `realm_access.roles` for Keycloak) via dot-separated navigation,
 * and space-separated string claims (e.g. Spring's default `scope` claim).
 *
 * Instantiated as a @Bean by SecurityConfig so the SecurityProperties
 * dependency is resolved in the correct order during context refresh.
 */
public class JwtAuthoritiesConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final SecurityProperties.Jwt config;

    public JwtAuthoritiesConverter(SecurityProperties properties) {
        this.config = properties.getJwt();
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        Collection<GrantedAuthority> authorities = extractAuthorities(jwt);
        return new JwtAuthenticationToken(jwt, authorities);
    }

    @SuppressWarnings("unchecked")
    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        String[] path = config.getAuthoritiesClaim().split("\\.");
        Object node = jwt.getClaims();
        for (String segment : path) {
            if (!(node instanceof Map<?, ?> map)) return List.of();
            node = map.get(segment);
            if (node == null) return List.of();
        }

        List<String> raw = new ArrayList<>();
        if (node instanceof String s) {
            for (String token : s.split("\\s+")) {
                if (!token.isBlank()) raw.add(token);
            }
        } else if (node instanceof Collection<?> coll) {
            for (Object item : coll) {
                if (item != null) raw.add(item.toString());
            }
        }

        List<GrantedAuthority> result = new ArrayList<>(raw.size());
        for (String value : raw) {
            result.add(new SimpleGrantedAuthority(config.getAuthoritiesPrefix() + value));
        }
        return result;
    }
}
