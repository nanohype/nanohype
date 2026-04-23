package __JAVA_PKG__.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Extracts an API key from a configured request header and delegates
 * authentication to the provided AuthenticationManager. If the header
 * is absent the filter is a no-op — downstream authentication
 * mechanisms (JWT bearer, opaque token) still have a chance to run.
 */
public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private final String headerName;
    private final AuthenticationManager authenticationManager;

    public ApiKeyAuthenticationFilter(String headerName, AuthenticationManager authenticationManager) {
        this.headerName = headerName;
        this.authenticationManager = authenticationManager;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {

        String apiKey = request.getHeader(headerName);
        if (apiKey == null || apiKey.isBlank()) {
            chain.doFilter(request, response);
            return;
        }

        try {
            Authentication authenticated = authenticationManager.authenticate(new ApiKeyAuthenticationToken(apiKey));
            SecurityContextHolder.getContext().setAuthentication(authenticated);
        } catch (AuthenticationException ex) {
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"invalid_api_key\"}");
            response.setContentType("application/json");
            return;
        }

        chain.doFilter(request, response);
    }
}
