package __JAVA_PKG__.security;

import java.util.Map;
import java.util.Optional;

/**
 * Default ApiKeyValidator backed by the `security.api-key.keys` map in
 * application configuration. Entries map a raw key value to the
 * principal name that authenticated callers assume. Useful for local
 * development and bootstrapping; replace with a persistence-backed
 * bean for production deployments — SecurityConfig registers this as
 * a @Bean via @ConditionalOnMissingBean so user replacements win.
 */
public class InMemoryApiKeyValidator implements ApiKeyValidator {

    private final Map<String, String> principalByKey;

    public InMemoryApiKeyValidator(SecurityProperties properties) {
        Map<String, String> configured = properties.getApiKey().getKeys();
        // Build a reverse lookup: header value → principal name.
        this.principalByKey = Map.copyOf(
            configured.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getValue, Map.Entry::getKey)));
    }

    @Override
    public Optional<String> validate(String rawKey) {
        return Optional.ofNullable(principalByKey.get(rawKey));
    }
}
