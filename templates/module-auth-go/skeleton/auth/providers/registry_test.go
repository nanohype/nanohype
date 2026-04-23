package providers

import (
	"errors"
	"net/http"
	"testing"

	"__GO_MODULE__/auth"
)

type stubProvider struct {
	name   string
	result auth.Result
}

func (s stubProvider) Name() string                            { return s.name }
func (s stubProvider) VerifyRequest(_ *http.Request) auth.Result { return s.result }

func TestRegisterAndGet(t *testing.T) {
	reset()
	Register(stubProvider{name: "alpha"})
	Register(stubProvider{name: "beta"})

	p, err := Get("alpha")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "alpha" {
		t.Fatalf("expected alpha, got %q", p.Name())
	}

	names := Names()
	if len(names) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(names))
	}
}

func TestGetUnknown(t *testing.T) {
	reset()
	_, err := Get("nope")
	if !errors.Is(err, ErrUnknownProvider) {
		t.Fatalf("expected ErrUnknownProvider, got %v", err)
	}
}

func TestRegisterDuplicatePanics(t *testing.T) {
	reset()
	Register(stubProvider{name: "dup"})

	defer func() {
		if recover() == nil {
			t.Fatal("expected panic on duplicate registration")
		}
	}()
	Register(stubProvider{name: "dup"})
}

func TestResolverBridgesRegistry(t *testing.T) {
	reset()
	Register(stubProvider{name: "real", result: auth.Result{Authenticated: true}})

	r := Resolver()
	v, err := r.Resolve("real")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !v.VerifyRequest(nil).Authenticated {
		t.Fatal("expected authenticated result from stub")
	}
}
