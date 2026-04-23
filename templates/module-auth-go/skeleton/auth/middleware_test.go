package auth

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeVerifier struct {
	result Result
}

func (f fakeVerifier) VerifyRequest(r *http.Request) Result { return f.result }

type fakeResolver struct {
	verifier RequestVerifier
	err      error
}

func (f fakeResolver) Resolve(name string) (RequestVerifier, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.verifier, nil
}

func TestMiddlewareRequiresProvider(t *testing.T) {
	if _, err := Middleware(Config{}, fakeResolver{}); err == nil {
		t.Fatal("expected error for empty Provider")
	}
}

func TestMiddlewareResolverError(t *testing.T) {
	boom := errors.New("unknown")
	if _, err := Middleware(Config{Provider: "x"}, fakeResolver{err: boom}); !errors.Is(err, boom) {
		t.Fatalf("expected resolver error to propagate, got %v", err)
	}
}

func TestMiddlewareAttachesUserOnSuccess(t *testing.T) {
	mw, err := Middleware(
		Config{Provider: "fake"},
		fakeResolver{verifier: fakeVerifier{result: Result{
			Authenticated: true,
			User:          &User{ID: "u-1", Roles: []string{"admin"}},
		}}},
	)
	if err != nil {
		t.Fatal(err)
	}

	var seen *User
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := FromContext(r.Context())
		seen = u
		w.WriteHeader(http.StatusOK)
	}))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if seen == nil || seen.ID != "u-1" {
		t.Fatalf("expected u-1 in context, got %+v", seen)
	}
}

func TestMiddlewareRejectsUnauthenticated(t *testing.T) {
	mw, err := Middleware(
		Config{Provider: "fake"},
		fakeResolver{verifier: fakeVerifier{result: Result{Reason: "bad token"}}},
	)
	if err != nil {
		t.Fatal(err)
	}

	var called bool
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))

	if called {
		t.Fatal("handler should not run on auth failure")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
	body, _ := io.ReadAll(rr.Body)
	if !strings.Contains(string(body), "bad token") {
		t.Fatalf("expected body to surface reason, got %q", body)
	}
	if rr.Header().Get("WWW-Authenticate") != "Bearer" {
		t.Fatal("expected WWW-Authenticate: Bearer on 401")
	}
}
