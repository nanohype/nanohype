package providers

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strings"

	"__GO_MODULE__/auth"
)

// APIKeyProvider validates requests carrying an API key in either the
// `X-API-Key` header or an Authorization header of the form
// "ApiKey <value>". Keys are loaded from the AUTH_API_KEYS environment
// variable as comma-separated entries of the form:
//
//	key[:role1+role2][:label]
//
// Example:
//
//	AUTH_API_KEYS=sk_live_abc:admin:billing-bot,sk_live_def:reader:analytics
type APIKeyProvider struct {
	keys map[string]apiKeyEntry
}

type apiKeyEntry struct {
	roles []string
	label string
}

// NewAPIKeyProvider constructs an APIKeyProvider from AUTH_API_KEYS.
func NewAPIKeyProvider() (*APIKeyProvider, error) {
	raw := os.Getenv("AUTH_API_KEYS")
	if raw == "" {
		return nil, fmt.Errorf("%w: set AUTH_API_KEYS", ErrProviderMisconfigured)
	}
	keys := map[string]apiKeyEntry{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		fields := strings.Split(part, ":")
		key := fields[0]
		if key == "" {
			continue
		}
		entry := apiKeyEntry{}
		if len(fields) >= 2 && fields[1] != "" {
			entry.roles = strings.Split(fields[1], "+")
		}
		if len(fields) >= 3 {
			entry.label = fields[2]
		}
		keys[key] = entry
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("%w: AUTH_API_KEYS contained no valid entries", ErrProviderMisconfigured)
	}
	return &APIKeyProvider{keys: keys}, nil
}

func (p *APIKeyProvider) Name() string { return "apikey" }

func (p *APIKeyProvider) VerifyRequest(r *http.Request) auth.Result {
	presented := extractAPIKey(r)
	if presented == "" {
		return auth.Result{Reason: "missing api key"}
	}
	// Constant-time lookup to avoid leaking key prefixes via timing.
	for key, entry := range p.keys {
		if subtle.ConstantTimeCompare([]byte(key), []byte(presented)) == 1 {
			id := entry.label
			if id == "" {
				id = keyFingerprint(key)
			}
			return auth.Result{
				Authenticated: true,
				User: &auth.User{
					ID:       id,
					Roles:    entry.roles,
					Metadata: map[string]any{"key_label": entry.label},
				},
			}
		}
	}
	return auth.Result{Reason: "invalid api key"}
}

func extractAPIKey(r *http.Request) string {
	if k := r.Header.Get("X-API-Key"); k != "" {
		return strings.TrimSpace(k)
	}
	if h := r.Header.Get("Authorization"); h != "" {
		const prefix = "ApiKey "
		if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
			return strings.TrimSpace(h[len(prefix):])
		}
	}
	return ""
}

// keyFingerprint returns a short, non-reversible identifier for log
// lines so operators can correlate requests to a key without printing
// it verbatim.
func keyFingerprint(k string) string {
	if len(k) <= 6 {
		return "apikey-" + k
	}
	return "apikey-" + k[:3] + "…" + k[len(k)-3:]
}
