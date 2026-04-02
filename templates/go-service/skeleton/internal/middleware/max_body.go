package middleware

import (
	"net/http"
)

// MaxBody is a chi-compatible middleware that limits the size of incoming
// request bodies. Requests that exceed maxBytes will receive a
// 413 Request Entity Too Large when the handler (or a subsequent
// middleware) attempts to read past the limit.
func MaxBody(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}
