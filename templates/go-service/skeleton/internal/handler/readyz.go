package handler

import (
	"context"
	"encoding/json"
	"net/http"
)

// ReadyzChecker is called during readiness checks to verify downstream
// dependencies (e.g., database, cache). Return nil when the dependency
// is healthy.
type ReadyzChecker func(ctx context.Context) error

// Readyz returns a readiness probe handler. When a checker is provided it
// is invoked on every request; a nil checker always reports ready.
func Readyz(check ReadyzChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if check != nil {
			if err := check(r.Context()); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{
					"status": "not_ready",
					"error":  err.Error(),
				})
				return
			}
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
	}
}
