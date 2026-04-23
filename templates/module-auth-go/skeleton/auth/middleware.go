package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// ProviderResolver is the indirection between the auth package and the
// providers package: given a provider name, it returns something that
// can verify a request. The providers package implements this in terms
// of its registry.
type ProviderResolver interface {
	Resolve(name string) (RequestVerifier, error)
}

// RequestVerifier is the minimal interface the middleware needs from a
// provider. The providers.Provider interface is a superset; consumers
// pass it through a small adapter so the auth package has no hard
// dependency on the providers package.
type RequestVerifier interface {
	VerifyRequest(r *http.Request) Result
}

// Middleware returns a net/http middleware that authenticates every
// incoming request using the provider named in cfg. Authenticated
// requests reach the wrapped handler with the user attached to the
// context (see FromContext). Unauthenticated requests get a JSON 401.
func Middleware(cfg Config, resolver ProviderResolver) (func(http.Handler) http.Handler, error) {
	if cfg.Provider == "" {
		return nil, fmt.Errorf("auth: Config.Provider is required")
	}
	provider, err := resolver.Resolve(cfg.Provider)
	if err != nil {
		return nil, err
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			res := provider.VerifyRequest(r)
			if !res.Authenticated {
				writeUnauthorized(w, res.Reason)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), res.User)))
		})
	}, nil
}

func writeUnauthorized(w http.ResponseWriter, reason string) {
	if reason == "" {
		reason = "authentication required"
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("WWW-Authenticate", "Bearer")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":  "unauthorized",
		"reason": reason,
	})
}

func writeForbidden(w http.ResponseWriter, reason string) {
	if reason == "" {
		reason = "forbidden"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":  "forbidden",
		"reason": reason,
	})
}
