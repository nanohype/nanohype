package __JAVA_PKG__.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Multi-provider SecurityFilterChain. Each strategy is gated by its own
 * `security.<strategy>.enabled` property — all three can be enabled
 * simultaneously. Spring Security's AuthenticationManager dispatches
 * to whichever provider supports the incoming Authentication type.
 *
 * For __PROJECT_NAME__.
 */
@Configuration
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfig {

    private final SecurityProperties properties;

    public SecurityConfig(SecurityProperties properties) {
        this.properties = properties;
    }

    @Bean
    @ConditionalOnProperty(prefix = "security.jwt", name = "enabled", havingValue = "true", matchIfMissing = true)
    JwtAuthoritiesConverter jwtAuthoritiesConverter() {
        return new JwtAuthoritiesConverter(properties);
    }

    @Bean
    @ConditionalOnProperty(prefix = "security.api-key", name = "enabled", havingValue = "true")
    @ConditionalOnMissingBean(ApiKeyValidator.class)
    ApiKeyValidator apiKeyValidator() {
        return new InMemoryApiKeyValidator(properties);
    }

    @Bean
    @ConditionalOnProperty(prefix = "security.api-key", name = "enabled", havingValue = "true")
    ApiKeyAuthenticationProvider apiKeyAuthenticationProvider(ApiKeyValidator validator) {
        return new ApiKeyAuthenticationProvider(validator);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        ApiKeyAuthenticationProvider apiKeyProvider =
            properties.getApiKey().isEnabled()
                ? new ApiKeyAuthenticationProvider(new InMemoryApiKeyValidator(properties))
                : null;
        AuthenticationManager apiKeyAuthManager =
            apiKeyProvider != null ? new ProviderManager(apiKeyProvider) : null;

        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/actuator/health/**",
                    "/actuator/info",
                    "/actuator/prometheus",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));

        if (properties.getJwt().isEnabled()) {
            http.oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt
                .jwtAuthenticationConverter(new JwtAuthoritiesConverter(properties))));
        }

        if (properties.getOpaqueToken().isEnabled()) {
            http.oauth2ResourceServer(oauth2 -> oauth2.opaqueToken(opaque -> opaque
                .introspectionUri(properties.getOpaqueToken().getIntrospectionUri())
                .introspectionClientCredentials(
                    properties.getOpaqueToken().getClientId(),
                    properties.getOpaqueToken().getClientSecret())));
        }

        if (apiKeyAuthManager != null) {
            ApiKeyAuthenticationFilter apiKeyFilter = new ApiKeyAuthenticationFilter(
                properties.getApiKey().getHeaderName(), apiKeyAuthManager);
            http.addFilterBefore(apiKeyFilter, BearerTokenAuthenticationFilter.class);
        }

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
