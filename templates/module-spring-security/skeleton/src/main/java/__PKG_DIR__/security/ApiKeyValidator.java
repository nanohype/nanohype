package __JAVA_PKG__.security;

import java.util.Optional;

/**
 * Contract for API key validation. Implementations resolve a raw key
 * to a principal name (typically the user or client identifier the
 * key belongs to). Return Optional.empty() for invalid keys.
 *
 * The default implementation (InMemoryApiKeyValidator) reads keys from
 * `security.api-key.keys` in application configuration. For production
 * use, replace with a bean backed by a database, secret store, or
 * external authentication service.
 */
public interface ApiKeyValidator {
    Optional<String> validate(String rawKey);
}
