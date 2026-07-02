package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"__GO_MODULE__/internal/handler"
	"__GO_MODULE__/internal/middleware"
	"__GO_MODULE__/internal/repository"
	"__GO_MODULE__/internal/service"
)

// newTestServer wires the router exactly as cmd/server/main.go does, so the
// tests exercise the real HTTP surface: middleware chain, routes, handlers,
// and the service layer behind them.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	svc := service.NewExampleService()
	exampleHandler := handler.NewExampleHandler(svc)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recovery)
	r.Use(middleware.MaxBody(1 << 20))

	r.Get("/health", handler.Health)
	r.Get("/readyz", handler.Readyz(nil))

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/examples", exampleHandler.List)
		r.Post("/examples", exampleHandler.Create)
		r.Get("/examples/{id}", exampleHandler.Get)
		r.Put("/examples/{id}", exampleHandler.Update)
		r.Delete("/examples/{id}", exampleHandler.Delete)
	})

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

func decodeJSON[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(body).Decode(&v); err != nil {
		t.Fatalf("decoding response body: %v", err)
	}
	return v
}

func TestHealth(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}

	body := decodeJSON[map[string]string](t, resp.Body)
	if body["status"] != "ok" {
		t.Errorf(`status field = %q, want "ok"`, body["status"])
	}
}

func TestReadyz(t *testing.T) {
	t.Run("nil checker reports ready", func(t *testing.T) {
		ts := newTestServer(t)

		resp, err := http.Get(ts.URL + "/readyz")
		if err != nil {
			t.Fatalf("GET /readyz: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
		}
		body := decodeJSON[map[string]string](t, resp.Body)
		if body["status"] != "ready" {
			t.Errorf(`status field = %q, want "ready"`, body["status"])
		}
	})

	t.Run("failing checker reports not ready", func(t *testing.T) {
		h := handler.Readyz(func(ctx context.Context) error {
			return fmt.Errorf("db unreachable")
		})

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
		}
		body := decodeJSON[map[string]string](t, rec.Body)
		if body["status"] != "not_ready" {
			t.Errorf(`status field = %q, want "not_ready"`, body["status"])
		}
		if body["error"] != "db unreachable" {
			t.Errorf(`error field = %q, want "db unreachable"`, body["error"])
		}
	})
}

func TestExampleLifecycle(t *testing.T) {
	ts := newTestServer(t)
	base := ts.URL + "/api/v1/examples"

	// ── Create ──
	payload := []byte(`{"name":"first","value":"v1"}`)
	resp, err := http.Post(base, "application/json", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("POST /examples: %v", err)
	}
	created := decodeJSON[repository.Example](t, resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", resp.StatusCode, http.StatusCreated)
	}
	if created.ID == "" {
		t.Fatal("created example has empty id")
	}
	if created.Name != "first" || created.Value != "v1" {
		t.Errorf("created = %+v, want name=first value=v1", created)
	}

	// ── Get ──
	resp, err = http.Get(base + "/" + created.ID)
	if err != nil {
		t.Fatalf("GET /examples/%s: %v", created.ID, err)
	}
	got := decodeJSON[repository.Example](t, resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if got.ID != created.ID || got.Name != "first" {
		t.Errorf("got = %+v, want id=%s name=first", got, created.ID)
	}

	// ── Update ──
	req, err := http.NewRequest(http.MethodPut, base+"/"+created.ID, bytes.NewReader([]byte(`{"name":"renamed","value":"v2"}`)))
	if err != nil {
		t.Fatalf("building PUT request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT /examples/%s: %v", created.ID, err)
	}
	updated := decodeJSON[repository.Example](t, resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if updated.Name != "renamed" || updated.Value != "v2" {
		t.Errorf("updated = %+v, want name=renamed value=v2", updated)
	}

	// ── List ──
	resp, err = http.Get(base)
	if err != nil {
		t.Fatalf("GET /examples: %v", err)
	}
	list := decodeJSON[[]repository.Example](t, resp.Body)
	resp.Body.Close()

	if len(list) != 1 {
		t.Fatalf("list length = %d, want 1", len(list))
	}
	if list[0].Name != "renamed" {
		t.Errorf("listed name = %q, want %q", list[0].Name, "renamed")
	}

	// ── Delete ──
	req, err = http.NewRequest(http.MethodDelete, base+"/"+created.ID, nil)
	if err != nil {
		t.Fatalf("building DELETE request: %v", err)
	}
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE /examples/%s: %v", created.ID, err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}

	// ── Get after delete ──
	resp, err = http.Get(base + "/" + created.ID)
	if err != nil {
		t.Fatalf("GET after delete: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("get-after-delete status = %d, want %d", resp.StatusCode, http.StatusNotFound)
	}
}

func TestCreateRejectsInvalidJSON(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/api/v1/examples", "application/json", bytes.NewReader([]byte(`{not json`)))
	if err != nil {
		t.Fatalf("POST /examples: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestGetUnknownIDReturns404(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/api/v1/examples/does-not-exist")
	if err != nil {
		t.Fatalf("GET /examples/does-not-exist: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusNotFound)
	}
}
