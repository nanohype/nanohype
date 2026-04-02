package middleware

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// RequestID is a chi-compatible middleware that propagates or generates a
// unique request identifier. If the incoming request carries an
// X-Request-Id header its value is reused; otherwise a random UUID v4 is
// generated. The ID is stored in the request context and echoed back in
// the response header.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			id = newUUID()
		}

		ctx := context.WithValue(r.Context(), requestIDKey, id)
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetRequestID extracts the request ID from the context, returning an
// empty string when none is present.
func GetRequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

// newUUID generates a UUID v4 using crypto/rand. It avoids pulling in an
// external dependency for a single call site.
func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
