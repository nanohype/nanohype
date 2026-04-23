package providers

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	"__GO_MODULE__/auth"
)

// JWTProvider validates Bearer JWTs using either a shared HMAC secret
// (AUTH_JWT_SECRET) or an RS256 JWKS endpoint (AUTH_JWT_JWKS_URL).
// Optional issuer and audience claims are validated when configured.
//
// Environment variables:
//
//	AUTH_JWT_SECRET    — HMAC secret (HS256). One of secret or JWKS is required.
//	AUTH_JWT_JWKS_URL  — JWKS endpoint (RS256/ES256). Fetched and cached with
//	                     background refresh.
//	AUTH_JWT_ISSUER    — optional expected `iss` claim.
//	AUTH_JWT_AUDIENCE  — optional expected `aud` claim.
type JWTProvider struct {
	secret   []byte
	keyfunc  jwt.Keyfunc
	issuer   string
	audience string
}

// NewJWTProvider constructs a JWTProvider from environment variables.
// Returns ErrProviderMisconfigured when neither HMAC secret nor JWKS
// URL is set.
func NewJWTProvider() (*JWTProvider, error) {
	p := &JWTProvider{
		issuer:   os.Getenv("AUTH_JWT_ISSUER"),
		audience: os.Getenv("AUTH_JWT_AUDIENCE"),
	}

	if secret := os.Getenv("AUTH_JWT_SECRET"); secret != "" {
		p.secret = []byte(secret)
		return p, nil
	}

	if jwksURL := os.Getenv("AUTH_JWT_JWKS_URL"); jwksURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
		if err != nil {
			return nil, fmt.Errorf("%w: jwks fetch failed: %v", ErrProviderMisconfigured, err)
		}
		p.keyfunc = k.Keyfunc
		return p, nil
	}

	return nil, fmt.Errorf("%w: set AUTH_JWT_SECRET or AUTH_JWT_JWKS_URL", ErrProviderMisconfigured)
}

func (p *JWTProvider) Name() string { return "jwt" }

func (p *JWTProvider) VerifyRequest(r *http.Request) auth.Result {
	token, err := bearerToken(r)
	if err != nil {
		return auth.Result{Reason: err.Error()}
	}
	return p.verifyToken(token)
}

func (p *JWTProvider) verifyToken(token string) auth.Result {
	claims := jwt.MapClaims{}
	parser := jwt.NewParser(jwt.WithValidMethods(validMethods(p)))

	_, err := parser.ParseWithClaims(token, claims, p.resolveKey)
	if err != nil {
		return auth.Result{Reason: fmt.Sprintf("invalid token: %v", err)}
	}

	if p.issuer != "" {
		if iss, _ := claims.GetIssuer(); iss != p.issuer {
			return auth.Result{Reason: "issuer mismatch"}
		}
	}
	if p.audience != "" {
		aud, _ := claims.GetAudience()
		if !containsString(aud, p.audience) {
			return auth.Result{Reason: "audience mismatch"}
		}
	}

	return auth.Result{Authenticated: true, User: userFromClaims(claims)}
}

func (p *JWTProvider) resolveKey(t *jwt.Token) (any, error) {
	if p.secret != nil {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method for HMAC provider")
		}
		return p.secret, nil
	}
	if p.keyfunc != nil {
		return p.keyfunc(t)
	}
	return nil, errors.New("no key material configured")
}

func validMethods(p *JWTProvider) []string {
	if p.secret != nil {
		return []string{"HS256", "HS384", "HS512"}
	}
	return []string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}
}

// userFromClaims maps common JWT claims onto an auth.User. Custom
// claims land in Metadata so callers can read them without modifying
// this provider.
func userFromClaims(claims jwt.MapClaims) *auth.User {
	u := &auth.User{Metadata: map[string]any{}}
	if sub, ok := claims["sub"].(string); ok {
		u.ID = sub
	}
	if email, ok := claims["email"].(string); ok {
		u.Email = email
	}
	u.Roles = extractRoles(claims)
	for k, v := range claims {
		switch k {
		case "sub", "email", "iss", "aud", "exp", "iat", "nbf", "jti":
			continue
		}
		u.Metadata[k] = v
	}
	return u
}

func extractRoles(claims jwt.MapClaims) []string {
	// Accept both "roles" and a namespaced "https://<issuer>/roles" pattern
	// common in Auth0 custom claims.
	for k, v := range claims {
		if k != "roles" && !strings.HasSuffix(k, "/roles") {
			continue
		}
		arr, ok := v.([]any)
		if !ok {
			continue
		}
		roles := make([]string, 0, len(arr))
		for _, r := range arr {
			if s, ok := r.(string); ok {
				roles = append(roles, s)
			}
		}
		return roles
	}
	return nil
}

func bearerToken(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", errors.New("missing authorization header")
	}
	const prefix = "Bearer "
	if len(h) < len(prefix) || subtle.ConstantTimeCompare([]byte(h[:len(prefix)]), []byte(prefix)) != 1 {
		// Fall back to case-insensitive check — some clients emit "bearer".
		if !strings.EqualFold(h[:min(len(prefix), len(h))], prefix) {
			return "", errors.New("authorization header is not a bearer token")
		}
	}
	token := strings.TrimSpace(h[len(prefix):])
	if token == "" {
		return "", errors.New("empty bearer token")
	}
	return token, nil
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
