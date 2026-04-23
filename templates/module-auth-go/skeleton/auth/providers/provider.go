// Package providers defines the pluggable provider contract for the
// auth module. Each implementation in this package self-registers at
// package init time. Consumers select a provider by name via
// auth.Config.Provider.
package providers

import (
	"fmt"
	"net/http"
	"sync"

	"__GO_MODULE__/auth"
)

// Provider verifies an HTTP request and reports whether it carries valid
// credentials. Implementations read whatever headers, cookies, or query
// parameters they need and return a fully populated Result.
type Provider interface {
	Name() string
	VerifyRequest(r *http.Request) auth.Result
}

var (
	mu       sync.RWMutex
	registry = map[string]Provider{}
)

// Register adds p to the global registry. It panics if a provider with
// the same name is already registered — init-time collisions indicate
// a wiring bug, not a recoverable condition.
func Register(p Provider) {
	mu.Lock()
	defer mu.Unlock()
	name := p.Name()
	if _, exists := registry[name]; exists {
		panic(fmt.Sprintf("auth: provider %q already registered", name))
	}
	registry[name] = p
}

// Get looks up a provider by name. Returns ErrUnknownProvider if no
// provider with that name has been registered.
func Get(name string) (Provider, error) {
	mu.RLock()
	defer mu.RUnlock()
	p, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownProvider, name)
	}
	return p, nil
}

// Names returns all registered provider names. Useful for diagnostics.
func Names() []string {
	mu.RLock()
	defer mu.RUnlock()
	names := make([]string, 0, len(registry))
	for n := range registry {
		names = append(names, n)
	}
	return names
}

// reset clears the registry. Test-only.
func reset() {
	mu.Lock()
	defer mu.Unlock()
	registry = map[string]Provider{}
}
