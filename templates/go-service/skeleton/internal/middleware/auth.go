package middleware

import (
	"net/http"
	"strings"
)

// Auth is a chi-compatible middleware that validates the Authorization header.
// It expects a Bearer token and checks it against a simple token validation.
// Replace the token validation logic with your own authentication mechanism
// (e.g., JWT verification, API key lookup, OAuth2 introspection).
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			http.Error(w, "invalid authorization header format", http.StatusUnauthorized)
			return
		}

		token := parts[1]
		if !validateToken(token) {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// validateToken performs token validation. Replace this with your actual
// authentication logic (JWT verification, database lookup, etc.).
func validateToken(token string) bool {
	// TODO: Implement real token validation.
	return token != ""
}
