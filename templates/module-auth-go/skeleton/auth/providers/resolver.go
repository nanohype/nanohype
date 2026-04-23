package providers

import "__GO_MODULE__/auth"

// Resolver returns an auth.ProviderResolver backed by the package-level
// registry. It is the glue that lets the auth middleware call into the
// providers package without introducing an import cycle.
//
// Callers must Register (or RegisterBuiltins) before constructing the
// middleware:
//
//	_ = providers.RegisterBuiltins("jwt")
//	mw, err := auth.Middleware(auth.Config{Provider: "jwt"}, providers.Resolver())
func Resolver() auth.ProviderResolver {
	return resolver{}
}

type resolver struct{}

func (resolver) Resolve(name string) (auth.RequestVerifier, error) {
	p, err := Get(name)
	if err != nil {
		return nil, err
	}
	return p, nil
}
