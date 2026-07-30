package providers

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Constructor and registration tests.
//
// Every provider is built from environment variables at startup, so a
// misconfiguration has exactly one chance to be caught: the constructor. A
// constructor that returns a usable-looking provider from missing config gives
// an service that starts cleanly and rejects every request, which reads as an
// auth outage rather than a config mistake.
//
// The JWKS-backed providers (auth0, clerk) reach the network on their happy
// path, so what is pinned here is their configuration handling — the half that
// runs before any socket is opened, and the half that is wrong most often.

func TestNewAPIKeyProviderParsesEntries(t *testing.T) {
	t.Setenv("AUTH_API_KEYS", " k1:admin+editor:ci-bot , k2 ,, k3:viewer ")

	p, err := NewAPIKeyProvider()
	if err != nil {
		t.Fatalf("NewAPIKeyProvider: %v", err)
	}
	if p.Name() != "apikey" {
		t.Errorf("Name() = %q, want %q", p.Name(), "apikey")
	}

	// Roles split on `+`, label is the third field, and both are optional. A
	// parser that mis-splits hands out the wrong roles, which is a privilege
	// bug rather than a parsing one.
	k1, ok := p.keys["k1"]
	if !ok {
		t.Fatal("k1 was not parsed")
	}
	if len(k1.roles) != 2 || k1.roles[0] != "admin" || k1.roles[1] != "editor" {
		t.Errorf("k1 roles = %v, want [admin editor]", k1.roles)
	}
	if k1.label != "ci-bot" {
		t.Errorf("k1 label = %q, want %q", k1.label, "ci-bot")
	}

	k2, ok := p.keys["k2"]
	if !ok {
		t.Fatal("k2 (no roles, no label) was not parsed")
	}
	if len(k2.roles) != 0 {
		t.Errorf("k2 roles = %v, want none", k2.roles)
	}

	if _, ok := p.keys["k3"]; !ok {
		t.Error("k3 was not parsed — the empty entry between k2 and k3 swallowed it")
	}
	if len(p.keys) != 3 {
		t.Errorf("parsed %d keys, want 3 (empty entries skipped)", len(p.keys))
	}
}

func TestNewAPIKeyProviderRejectsEmptyConfig(t *testing.T) {
	for name, value := range map[string]string{
		"unset":           "",
		"only separators": ",, ,",
		"only empty keys": ":admin,:viewer",
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("AUTH_API_KEYS", value)
			_, err := NewAPIKeyProvider()
			if !errors.Is(err, ErrProviderMisconfigured) {
				t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
			}
		})
	}
}

func TestNewJWTProviderPrefersTheSharedSecret(t *testing.T) {
	t.Setenv("AUTH_JWT_SECRET", "s3cret")
	t.Setenv("AUTH_JWT_ISSUER", "https://issuer.example")
	t.Setenv("AUTH_JWT_AUDIENCE", "api")
	// Set as well, to pin the precedence: the secret path returns before any
	// JWKS fetch, so a misordered constructor would try the network here and
	// fail in an environment that has no business reaching it.
	t.Setenv("AUTH_JWT_JWKS_URL", "http://127.0.0.1:1/jwks.json")

	p, err := NewJWTProvider()
	if err != nil {
		t.Fatalf("NewJWTProvider: %v", err)
	}
	if p.Name() != "jwt" {
		t.Errorf("Name() = %q, want %q", p.Name(), "jwt")
	}
	if string(p.secret) != "s3cret" {
		t.Errorf("secret = %q, want the configured value", string(p.secret))
	}
	if p.keyfunc != nil {
		t.Error("keyfunc was set despite a shared secret being configured")
	}
}

func TestNewJWTProviderRequiresOneOfSecretOrJWKS(t *testing.T) {
	t.Setenv("AUTH_JWT_SECRET", "")
	t.Setenv("AUTH_JWT_JWKS_URL", "")
	if _, err := NewJWTProvider(); !errors.Is(err, ErrProviderMisconfigured) {
		t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
	}
}

func TestNewSupabaseProvider(t *testing.T) {
	t.Setenv("SUPABASE_JWT_SECRET", "")
	if _, err := NewSupabaseProvider(); !errors.Is(err, ErrProviderMisconfigured) {
		t.Fatalf("err = %v, want ErrProviderMisconfigured for an unset secret", err)
	}

	t.Setenv("SUPABASE_JWT_SECRET", "supa-secret")
	p, err := NewSupabaseProvider()
	if err != nil {
		t.Fatalf("NewSupabaseProvider: %v", err)
	}
	if p.Name() != "supabase" {
		t.Errorf("Name() = %q, want %q", p.Name(), "supabase")
	}
	// Supabase mints tokens with aud=authenticated; hardcoding it is what makes
	// the provider work without extra config, so it is pinned rather than left
	// implicit.
	if p.inner.audience != "authenticated" {
		t.Errorf("audience = %q, want %q", p.inner.audience, "authenticated")
	}
}

func TestSupabaseVerifyPromotesTheMetadataRole(t *testing.T) {
	t.Setenv("SUPABASE_JWT_SECRET", "supa-secret")
	p, err := NewSupabaseProvider()
	if err != nil {
		t.Fatalf("NewSupabaseProvider: %v", err)
	}

	token := signHS256(t, []byte("supa-secret"), jwt.MapClaims{
		"sub":  "user-1",
		"aud":  "authenticated",
		"exp":  time.Now().Add(time.Hour).Unix(),
		"role": "service_role",
	})

	res := p.VerifyRequest(makeRequestWithBearer(token))
	if !res.Authenticated {
		t.Fatalf("not authenticated: %s", res.Reason)
	}
	// The role claim is what Supabase uses for row-level security, so it has to
	// reach Roles or every downstream guard sees an unprivileged user.
	if len(res.User.Roles) == 0 || res.User.Roles[0] != "service_role" {
		t.Errorf("Roles = %v, want service_role first", res.User.Roles)
	}
}

func TestSupabaseVerifyRejectsAMissingBearer(t *testing.T) {
	t.Setenv("SUPABASE_JWT_SECRET", "supa-secret")
	p, _ := NewSupabaseProvider()
	res := p.VerifyRequest(&http.Request{Header: http.Header{}})
	if res.Authenticated {
		t.Fatal("authenticated a request with no Authorization header")
	}
	if res.Reason == "" {
		t.Error("rejection carried no reason — an operator cannot debug that")
	}
}

func TestJWKSProvidersRejectMissingConfigBeforeTouchingTheNetwork(t *testing.T) {
	// Both fail on config well before the JWKS fetch, which is what makes this
	// runnable offline — and what makes a misconfigured deploy fail at startup
	// rather than on a DNS timeout.
	t.Run("auth0 without domain or audience", func(t *testing.T) {
		t.Setenv("AUTH0_DOMAIN", "")
		t.Setenv("AUTH0_AUDIENCE", "")
		if _, err := NewAuth0Provider(); !errors.Is(err, ErrProviderMisconfigured) {
			t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
		}
	})

	t.Run("auth0 with domain but no audience", func(t *testing.T) {
		t.Setenv("AUTH0_DOMAIN", "tenant.eu.auth0.com")
		t.Setenv("AUTH0_AUDIENCE", "")
		if _, err := NewAuth0Provider(); !errors.Is(err, ErrProviderMisconfigured) {
			t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
		}
	})

	t.Run("clerk without frontend api", func(t *testing.T) {
		t.Setenv("CLERK_FRONTEND_API", "")
		if _, err := NewClerkProvider(); !errors.Is(err, ErrProviderMisconfigured) {
			t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
		}
	})
}

func TestRegisterBuiltins(t *testing.T) {
	t.Run("unknown name", func(t *testing.T) {
		err := RegisterBuiltins("okta")
		if !errors.Is(err, ErrUnknownBuiltin) {
			t.Fatalf("err = %v, want ErrUnknownBuiltin", err)
		}
	})

	t.Run("known name with missing config propagates the constructor error", func(t *testing.T) {
		// The registry must stay empty in this case. Registering a
		// half-constructed provider is how a service comes up "with auth"
		// and rejects everything.
		t.Setenv("AUTH_API_KEYS", "")
		err := RegisterBuiltins("apikey")
		if !errors.Is(err, ErrProviderMisconfigured) {
			t.Fatalf("err = %v, want ErrProviderMisconfigured", err)
		}
	})

	t.Run("registers each provider it can build offline", func(t *testing.T) {
		t.Setenv("AUTH_API_KEYS", "k1:admin")
		t.Setenv("AUTH_JWT_SECRET", "s3cret")
		t.Setenv("SUPABASE_JWT_SECRET", "supa-secret")

		for name := range map[string]struct{}{"apikey": {}, "jwt": {}, "supabase": {}} {
			if err := RegisterBuiltins(name); err != nil {
				t.Fatalf("RegisterBuiltins(%q): %v", name, err)
			}
			p, err := Get(name)
			if err != nil {
				t.Fatalf("%q was not in the registry after RegisterBuiltins: %v", name, err)
			}
			// The registry keys on the provider's own Name(); a mismatch means
			// a config naming one provider silently gets another.
			if p.Name() != name {
				t.Errorf("registered under %q but Name() = %q", name, p.Name())
			}
		}
	})
}
