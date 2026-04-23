package providers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func makeHMACProvider(t *testing.T, issuer, audience string) *JWTProvider {
	t.Helper()
	return &JWTProvider{
		secret:   []byte("test-secret-please-rotate"),
		issuer:   issuer,
		audience: audience,
	}
}

func signHS256(t *testing.T, secret []byte, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(secret)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func makeRequestWithBearer(token string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func TestJWTValidToken(t *testing.T) {
	p := makeHMACProvider(t, "", "")
	token := signHS256(t, p.secret, jwt.MapClaims{
		"sub":   "user-42",
		"email": "alice@example.com",
		"roles": []any{"admin"},
		"exp":   time.Now().Add(time.Hour).Unix(),
	})

	res := p.VerifyRequest(makeRequestWithBearer(token))
	if !res.Authenticated {
		t.Fatalf("expected authenticated, got reason %q", res.Reason)
	}
	if res.User.ID != "user-42" {
		t.Fatalf("expected user id user-42, got %q", res.User.ID)
	}
	if res.User.Email != "alice@example.com" {
		t.Fatalf("expected email, got %q", res.User.Email)
	}
	if !res.User.HasRole("admin") {
		t.Fatalf("expected admin role, got %v", res.User.Roles)
	}
}

func TestJWTExpiredToken(t *testing.T) {
	p := makeHMACProvider(t, "", "")
	token := signHS256(t, p.secret, jwt.MapClaims{
		"sub": "user-42",
		"exp": time.Now().Add(-time.Hour).Unix(),
	})

	res := p.VerifyRequest(makeRequestWithBearer(token))
	if res.Authenticated {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestJWTWrongSecret(t *testing.T) {
	p := makeHMACProvider(t, "", "")
	bogus := signHS256(t, []byte("other-secret"), jwt.MapClaims{"sub": "u"})

	res := p.VerifyRequest(makeRequestWithBearer(bogus))
	if res.Authenticated {
		t.Fatal("expected signature mismatch to be rejected")
	}
}

func TestJWTIssuerMismatch(t *testing.T) {
	p := makeHMACProvider(t, "https://expected.example/", "")
	token := signHS256(t, p.secret, jwt.MapClaims{
		"sub": "u",
		"iss": "https://other.example/",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	res := p.VerifyRequest(makeRequestWithBearer(token))
	if res.Authenticated {
		t.Fatalf("expected issuer rejection, got %+v", res)
	}
}

func TestJWTAudienceMismatch(t *testing.T) {
	p := makeHMACProvider(t, "", "api.example")
	token := signHS256(t, p.secret, jwt.MapClaims{
		"sub": "u",
		"aud": "other.api",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	res := p.VerifyRequest(makeRequestWithBearer(token))
	if res.Authenticated {
		t.Fatalf("expected audience rejection, got %+v", res)
	}
}

func TestJWTMissingBearer(t *testing.T) {
	p := makeHMACProvider(t, "", "")
	res := p.VerifyRequest(httptest.NewRequest(http.MethodGet, "/x", nil))
	if res.Authenticated {
		t.Fatal("expected missing header to be rejected")
	}
}
