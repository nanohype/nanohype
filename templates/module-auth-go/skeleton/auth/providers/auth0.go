package providers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"

	"__GO_MODULE__/auth"
)

// Auth0Provider validates JWTs issued by an Auth0 tenant. Under the
// hood this is an RS256/JWKS JWT verifier pre-wired with the tenant's
// issuer and audience so callers don't have to compose the URL.
//
// Environment variables:
//
//	AUTH0_DOMAIN    — e.g. "your-tenant.us.auth0.com" (no scheme).
//	AUTH0_AUDIENCE  — the API audience registered in Auth0.
type Auth0Provider struct {
	inner *JWTProvider
}

// NewAuth0Provider constructs an Auth0Provider from environment variables.
func NewAuth0Provider() (*Auth0Provider, error) {
	domain := strings.TrimSuffix(os.Getenv("AUTH0_DOMAIN"), "/")
	audience := os.Getenv("AUTH0_AUDIENCE")
	if domain == "" || audience == "" {
		return nil, fmt.Errorf("%w: set AUTH0_DOMAIN and AUTH0_AUDIENCE", ErrProviderMisconfigured)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	jwksURL := fmt.Sprintf("https://%s/.well-known/jwks.json", domain)
	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("%w: auth0 jwks fetch failed: %v", ErrProviderMisconfigured, err)
	}

	return &Auth0Provider{
		inner: &JWTProvider{
			keyfunc:  k.Keyfunc,
			issuer:   fmt.Sprintf("https://%s/", domain),
			audience: audience,
		},
	}, nil
}

func (p *Auth0Provider) Name() string { return "auth0" }

func (p *Auth0Provider) VerifyRequest(r *http.Request) auth.Result {
	token, err := bearerToken(r)
	if err != nil {
		return auth.Result{Reason: err.Error()}
	}
	return p.inner.verifyToken(token)
}

