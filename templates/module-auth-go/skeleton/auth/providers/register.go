package providers

import (
	"errors"
	"fmt"
)

// RegisterBuiltins constructs and registers the named built-in provider.
// Returns ErrProviderMisconfigured wrapped with a diagnostic message if
// the provider's required environment configuration is missing — the
// caller should surface this to operators at startup rather than
// swallowing it.
//
// Passing an unknown provider name returns ErrUnknownBuiltin.
func RegisterBuiltins(name string) error {
	var (
		p   Provider
		err error
	)
	switch name {
	case "jwt":
		p, err = NewJWTProvider()
	case "auth0":
		p, err = NewAuth0Provider()
	case "clerk":
		p, err = NewClerkProvider()
	case "supabase":
		p, err = NewSupabaseProvider()
	case "apikey":
		p, err = NewAPIKeyProvider()
	default:
		return fmt.Errorf("%w: %q", ErrUnknownBuiltin, name)
	}
	if err != nil {
		return err
	}
	Register(p)
	return nil
}

// ErrUnknownBuiltin is returned by RegisterBuiltins when the requested
// name does not match any built-in provider.
var ErrUnknownBuiltin = errors.New("auth: unknown built-in provider")
