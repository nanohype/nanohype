package auth

import "net/http"

// RequireAuth wraps next with a guard that returns 401 if no
// authenticated user is attached to the request context. Intended for
// routes mounted under the Middleware chain where auth should be
// enforced per-handler rather than across the whole router.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := FromContext(r.Context()); !ok {
			writeUnauthorized(w, "authentication required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole returns a middleware that allows the request through only
// if the authenticated user carries the named role. Emits 401 if no
// user is present and 403 if the user lacks the role.
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := FromContext(r.Context())
			if !ok {
				writeUnauthorized(w, "authentication required")
				return
			}
			if !user.HasRole(role) {
				writeForbidden(w, "role "+role+" required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
