package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func ok(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func TestRequireAuthPassesWhenUserPresent(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req = req.WithContext(WithUser(req.Context(), &User{ID: "u-1"}))

	rr := httptest.NewRecorder()
	RequireAuth(http.HandlerFunc(ok)).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestRequireAuthRejectsWhenMissing(t *testing.T) {
	rr := httptest.NewRecorder()
	RequireAuth(http.HandlerFunc(ok)).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestRequireRoleAllows(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req = req.WithContext(WithUser(req.Context(), &User{ID: "u-1", Roles: []string{"admin"}}))

	rr := httptest.NewRecorder()
	RequireRole("admin")(http.HandlerFunc(ok)).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestRequireRoleForbidsMissingRole(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req = req.WithContext(WithUser(req.Context(), &User{ID: "u-1", Roles: []string{"viewer"}}))

	rr := httptest.NewRecorder()
	RequireRole("admin")(http.HandlerFunc(ok)).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rr.Code)
	}
}

func TestRequireRoleUnauthorizedWhenNoUser(t *testing.T) {
	rr := httptest.NewRecorder()
	RequireRole("admin")(http.HandlerFunc(ok)).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}
