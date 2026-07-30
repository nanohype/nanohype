package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

// Middleware sits in front of every request, so a fault here is a fault in all
// of them — and each of these fails quietly rather than loudly. Recovery that
// does not recover turns one bad request into a dead process; a request ID that
// is regenerated per hop breaks trace correlation without any error; a logger
// that does not mask credentials writes bearer tokens into log storage, where
// they persist long after the request is gone.

func ok(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

func TestRecoveryTurnsAPanicIntoA500(t *testing.T) {
	h := Recovery(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))

	rec := httptest.NewRecorder()
	// The assertion is as much that this call *returns* as that the status is
	// 500: an unrecovered panic unwinds past the test.
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	// The panic value must not reach the client. "boom" here would be an
	// information leak in the general case, where the value is often an error
	// carrying a query or a path.
	if strings.Contains(string(body), "boom") {
		t.Errorf("panic value leaked into the response body: %q", body)
	}
}

func TestRecoveryPassesNormalRequestsThrough(t *testing.T) {
	h := Recovery(http.HandlerFunc(ok))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

var uuidV4 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestRequestIDGeneratesAUUIDWhenAbsent(t *testing.T) {
	var seen string
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = GetRequestID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if !uuidV4.MatchString(seen) {
		t.Errorf("generated id %q is not a UUID v4 — the version and variant bits are set by hand", seen)
	}
	// Context and response header must agree, or a client correlating on the
	// header looks up an id the server never logged.
	if got := rec.Header().Get("X-Request-Id"); got != seen {
		t.Errorf("header %q does not match context id %q", got, seen)
	}
}

func TestRequestIDReusesAnIncomingID(t *testing.T) {
	const upstream = "11111111-2222-4333-8444-555555555555"
	var seen string
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = GetRequestID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-Id", upstream)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	// Propagation, not generation. Minting a fresh id per service severs the
	// trace exactly where a multi-hop request most needs it.
	if seen != upstream {
		t.Errorf("id = %q, want the incoming %q", seen, upstream)
	}
	if got := rec.Header().Get("X-Request-Id"); got != upstream {
		t.Errorf("echoed %q, want %q", got, upstream)
	}
}

func TestGetRequestIDOnAContextWithoutOne(t *testing.T) {
	if got := GetRequestID(httptest.NewRequest(http.MethodGet, "/", nil).Context()); got != "" {
		t.Errorf("GetRequestID = %q, want empty", got)
	}
}

func TestRequestIDsAreDistinct(t *testing.T) {
	seen := map[string]bool{}
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen[GetRequestID(r.Context())] = true
		w.WriteHeader(http.StatusOK)
	}))
	for range 100 {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	}
	// A generator that ignored crypto/rand's output would collapse to one value.
	if len(seen) != 100 {
		t.Errorf("got %d distinct ids from 100 requests", len(seen))
	}
}

func TestMaskAuthorization(t *testing.T) {
	for _, tc := range []struct {
		name, in, want string
	}{
		{"empty stays empty", "", ""},
		{"bearer keeps its scheme", "Bearer eyJhbGciOi.secret.parts", "Bearer ***"},
		{"other schemes are replaced whole", "Basic dXNlcjpwYXNz", "***"},
		{"a bare token is replaced whole", "abcdef123456", "***"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := maskAuthorization(tc.in)
			if got != tc.want {
				t.Errorf("maskAuthorization(%q) = %q, want %q", tc.in, got, tc.want)
			}
			// The property that actually matters, independent of format: no
			// part of the credential survives into the log line.
			if tc.in != "" && strings.Contains(got, "secret") {
				t.Errorf("credential material survived masking: %q", got)
			}
		})
	}
}

func TestIsSensitiveHeader(t *testing.T) {
	for _, name := range []string{"Authorization", "authorization", "Cookie", "Set-Cookie"} {
		if !isSensitiveHeader(name) {
			t.Errorf("isSensitiveHeader(%q) = false — case-insensitive matching is the point", name)
		}
	}
	for _, name := range []string{"Accept", "Content-Type", "X-Request-Id"} {
		if isSensitiveHeader(name) {
			t.Errorf("isSensitiveHeader(%q) = true, want false", name)
		}
	}
}

func TestLoggerPassesThroughAndRecordsTheStatus(t *testing.T) {
	h := Logger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("body"))
	}))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	// The wrapper must not swallow either the status or the body.
	if rec.Code != http.StatusTeapot {
		t.Errorf("status = %d, want 418", rec.Code)
	}
	if got := rec.Body.String(); got != "body" {
		t.Errorf("body = %q, want %q", got, "body")
	}
}

func TestResponseWriterDefaultsTo200(t *testing.T) {
	// Go treats a handler that writes without calling WriteHeader as a 200, so
	// the wrapper has to start there — otherwise every such response is logged
	// as status 0.
	rw := newResponseWriter(httptest.NewRecorder())
	if rw.statusCode != http.StatusOK {
		t.Errorf("initial statusCode = %d, want 200", rw.statusCode)
	}
	rw.WriteHeader(http.StatusNotFound)
	if rw.statusCode != http.StatusNotFound {
		t.Errorf("statusCode = %d, want 404", rw.statusCode)
	}
}

func TestMaxBodyRejectsAnOversizedBody(t *testing.T) {
	var readErr error
	h := MaxBody(8)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, readErr = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(strings.Repeat("x", 64)))
	h.ServeHTTP(httptest.NewRecorder(), req)

	// The limit is enforced at read time by MaxBytesReader, so the failure
	// surfaces to the handler rather than at the middleware. Without this the
	// service will happily buffer whatever it is sent.
	if readErr == nil {
		t.Fatal("reading a body past the limit returned no error")
	}
}

func TestMaxBodyAllowsABodyWithinTheLimit(t *testing.T) {
	var body []byte
	h := MaxBody(1024)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", strings.NewReader("small")))
	if string(body) != "small" {
		t.Errorf("body = %q, want %q", body, "small")
	}
}
