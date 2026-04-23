package providers

import (
	"fmt"
	"net/http"
	"os"

	"__GO_MODULE__/auth"
)

// SupabaseProvider validates JWTs issued by Supabase Auth using the
// project's shared JWT secret (HS256). Supabase access tokens carry the
// `aud` claim "authenticated" and a `role` claim that we promote to
// the first entry in User.Roles.
//
// Environment variables:
//
//	SUPABASE_JWT_SECRET — the project's JWT secret, available under
//	                      Project Settings → API → JWT Settings in the
//	                      Supabase dashboard.
type SupabaseProvider struct {
	inner *JWTProvider
}

// NewSupabaseProvider constructs a SupabaseProvider from environment
// variables.
func NewSupabaseProvider() (*SupabaseProvider, error) {
	secret := os.Getenv("SUPABASE_JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("%w: set SUPABASE_JWT_SECRET", ErrProviderMisconfigured)
	}
	return &SupabaseProvider{
		inner: &JWTProvider{
			secret:   []byte(secret),
			audience: "authenticated",
		},
	}, nil
}

func (p *SupabaseProvider) Name() string { return "supabase" }

func (p *SupabaseProvider) VerifyRequest(r *http.Request) auth.Result {
	token, err := bearerToken(r)
	if err != nil {
		return auth.Result{Reason: err.Error()}
	}
	res := p.inner.verifyToken(token)
	if res.Authenticated && res.User != nil {
		if role, ok := res.User.Metadata["role"].(string); ok && role != "" {
			res.User.Roles = append([]string{role}, res.User.Roles...)
		}
	}
	return res
}
