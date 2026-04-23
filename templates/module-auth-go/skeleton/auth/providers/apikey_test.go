package providers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func makeAPIKeyProvider() *APIKeyProvider {
	return &APIKeyProvider{
		keys: map[string]apiKeyEntry{
			"sk_admin": {roles: []string{"admin"}, label: "billing-bot"},
			"sk_read":  {roles: []string{"reader"}},
		},
	}
}

func TestAPIKeyValidXHeader(t *testing.T) {
	p := makeAPIKeyProvider()
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("X-API-Key", "sk_admin")

	res := p.VerifyRequest(r)
	if !res.Authenticated {
		t.Fatal("expected authenticated")
	}
	if res.User.ID != "billing-bot" {
		t.Fatalf("expected id billing-bot, got %q", res.User.ID)
	}
	if !res.User.HasRole("admin") {
		t.Fatalf("expected admin role, got %v", res.User.Roles)
	}
}

func TestAPIKeyValidAuthorizationHeader(t *testing.T) {
	p := makeAPIKeyProvider()
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Authorization", "ApiKey sk_read")

	res := p.VerifyRequest(r)
	if !res.Authenticated {
		t.Fatal("expected authenticated")
	}
	if res.User.HasRole("admin") {
		t.Fatal("reader should not hold admin role")
	}
}

func TestAPIKeyMissing(t *testing.T) {
	p := makeAPIKeyProvider()
	r := httptest.NewRequest(http.MethodGet, "/x", nil)

	res := p.VerifyRequest(r)
	if res.Authenticated {
		t.Fatal("expected missing key to reject")
	}
}

func TestAPIKeyInvalid(t *testing.T) {
	p := makeAPIKeyProvider()
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("X-API-Key", "sk_unknown")

	res := p.VerifyRequest(r)
	if res.Authenticated {
		t.Fatal("expected invalid key to reject")
	}
}
