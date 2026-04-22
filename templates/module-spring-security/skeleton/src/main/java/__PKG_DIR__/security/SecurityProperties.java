package __JAVA_PKG__.security;

import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Typed configuration surface for the multi-provider SecurityFilterChain.
 * Bound at `security.*` in application.yaml.
 */
@ConfigurationProperties(prefix = "security")
public class SecurityProperties {

    private Jwt jwt = new Jwt();
    private ApiKey apiKey = new ApiKey();
    private OpaqueToken opaqueToken = new OpaqueToken();

    public Jwt getJwt() { return jwt; }
    public void setJwt(Jwt jwt) { this.jwt = jwt; }

    public ApiKey getApiKey() { return apiKey; }
    public void setApiKey(ApiKey apiKey) { this.apiKey = apiKey; }

    public OpaqueToken getOpaqueToken() { return opaqueToken; }
    public void setOpaqueToken(OpaqueToken opaqueToken) { this.opaqueToken = opaqueToken; }

    public static class Jwt {
        /** Whether JWT bearer-token auth is enabled. */
        private boolean enabled = true;
        /** OIDC issuer URL. If set, JwtDecoder auto-discovers JWKs via the well-known endpoint. */
        private String issuerUri = "";
        /** Explicit JWKs endpoint. Used only when issuerUri is blank. */
        private String jwkSetUri = "";
        /** Required audience claim value. Empty disables the audience check. */
        private String audience = "__ALLOWED_AUD__";
        /**
         * Dot-separated path to the claim carrying authorities. Examples:
         *   realm_access.roles   (Keycloak)
         *   scope                (Spring default — space-separated scopes)
         *   https://example.com/roles  (Auth0 custom namespaced claim)
         */
        private String authoritiesClaim = "scope";
        /** Prefix added to each extracted authority. Empty for no prefix. */
        private String authoritiesPrefix = "SCOPE_";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getIssuerUri() { return issuerUri; }
        public void setIssuerUri(String issuerUri) { this.issuerUri = issuerUri; }
        public String getJwkSetUri() { return jwkSetUri; }
        public void setJwkSetUri(String jwkSetUri) { this.jwkSetUri = jwkSetUri; }
        public String getAudience() { return audience; }
        public void setAudience(String audience) { this.audience = audience; }
        public String getAuthoritiesClaim() { return authoritiesClaim; }
        public void setAuthoritiesClaim(String authoritiesClaim) { this.authoritiesClaim = authoritiesClaim; }
        public String getAuthoritiesPrefix() { return authoritiesPrefix; }
        public void setAuthoritiesPrefix(String authoritiesPrefix) { this.authoritiesPrefix = authoritiesPrefix; }
    }

    public static class ApiKey {
        /** Whether header-based API key auth is enabled. */
        private boolean enabled = false;
        /** HTTP header carrying the API key. */
        private String headerName = "X-API-Key";
        /** Static key → principal-name map consulted by InMemoryApiKeyValidator. */
        private Map<String, String> keys = new HashMap<>();

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getHeaderName() { return headerName; }
        public void setHeaderName(String headerName) { this.headerName = headerName; }
        public Map<String, String> getKeys() { return keys; }
        public void setKeys(Map<String, String> keys) { this.keys = keys; }
    }

    public static class OpaqueToken {
        /** Whether opaque-token introspection auth is enabled. */
        private boolean enabled = false;
        /** RFC 7662 introspection endpoint URL. */
        private String introspectionUri = "";
        /** Client credentials for the introspection endpoint. */
        private String clientId = "";
        private String clientSecret = "";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getIntrospectionUri() { return introspectionUri; }
        public void setIntrospectionUri(String introspectionUri) { this.introspectionUri = introspectionUri; }
        public String getClientId() { return clientId; }
        public void setClientId(String clientId) { this.clientId = clientId; }
        public String getClientSecret() { return clientSecret; }
        public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    }
}
