package middleware

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// maskAuthorization returns a masked version of the Authorization
// header value. Bearer tokens are replaced with "Bearer ***", other
// schemes are replaced entirely with "***".
func maskAuthorization(value string) string {
	if value == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return "Bearer ***"
	}
	return "***"
}

// isSensitiveHeader returns true for header names that should be masked
// in log output.
func isSensitiveHeader(name string) bool {
	lower := strings.ToLower(name)
	switch lower {
	case "authorization", "x-api-key", "cookie", "set-cookie", "proxy-authorization":
		return true
	}
	for _, sub := range []string{"key", "secret", "token", "password"} {
		if strings.Contains(lower, sub) {
			return true
		}
	}
	return false
}

// Logger is a chi-compatible middleware that logs each request using slog.
// It records the method, path, status code, and duration in milliseconds.
// The request_id is pulled from the context (set by the RequestID
// middleware). Sensitive headers are masked before logging.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := newResponseWriter(w)

		next.ServeHTTP(rw, r)

		durationMs := float64(time.Since(start).Microseconds()) / 1000.0

		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.statusCode,
			"duration_ms", durationMs,
			"remote", r.RemoteAddr,
			"request_id", GetRequestID(r.Context()),
		}

		// Include Authorization header in masked form when present
		if auth := r.Header.Get("Authorization"); auth != "" {
			attrs = append(attrs, "authorization", maskAuthorization(auth))
		}

		// Pick the appropriate log level based on status code
		switch {
		case rw.statusCode >= 500:
			slog.Error("request", attrs...)
		case rw.statusCode >= 400:
			slog.Warn("request", attrs...)
		default:
			slog.Info("request", attrs...)
		}
	})
}
