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

// ClerkProvider validates session JWTs issued by Clerk. Clerk publishes
// its signing keys at a per-instance JWKS endpoint derived from the
// Clerk Frontend API URL; the session token's `iss` claim also contains
// that URL, so we pin both.
//
// Environment variables:
//
//	CLERK_FRONTEND_API — e.g. "https://clerk.your-app.com" or
//	                     "https://<instance>.clerk.accounts.dev". The
//	                     value is used both as expected issuer and as
//	                     the JWKS host.
//	CLERK_AUDIENCE     — optional expected `aud` claim.
//
// Clerk ships a full Go SDK (github.com/clerk/clerk-sdk-go); this
// provider intentionally stays dependency-light and verifies session
// tokens via JWKS directly. Swap in the SDK if you need user lookups,
// webhooks, or session management beyond authentication.
type ClerkProvider struct {
	inner *JWTProvider
}

// NewClerkProvider constructs a ClerkProvider from environment variables.
func NewClerkProvider() (*ClerkProvider, error) {
	frontendAPI := strings.TrimSuffix(os.Getenv("CLERK_FRONTEND_API"), "/")
	if frontendAPI == "" {
		return nil, fmt.Errorf("%w: set CLERK_FRONTEND_API", ErrProviderMisconfigured)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	jwksURL := frontendAPI + "/.well-known/jwks.json"
	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("%w: clerk jwks fetch failed: %v", ErrProviderMisconfigured, err)
	}

	return &ClerkProvider{
		inner: &JWTProvider{
			keyfunc:  k.Keyfunc,
			issuer:   frontendAPI,
			audience: os.Getenv("CLERK_AUDIENCE"),
		},
	}, nil
}

func (p *ClerkProvider) Name() string { return "clerk" }

func (p *ClerkProvider) VerifyRequest(r *http.Request) auth.Result {
	token, err := bearerToken(r)
	if err != nil {
		return auth.Result{Reason: err.Error()}
	}
	return p.inner.verifyToken(token)
}
