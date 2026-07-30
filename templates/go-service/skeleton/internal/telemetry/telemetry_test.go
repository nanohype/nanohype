package telemetry

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
)

// Setup runs once at startup and its failure mode is silence: if the tracer
// provider is never registered, every span the service creates goes to the
// no-op provider and the service looks instrumented while emitting nothing.

func TestSetupRegistersATracerProviderAndReturnsAShutdown(t *testing.T) {
	before := otel.GetTracerProvider()
	ctx := context.Background()

	shutdown, err := Setup(ctx, "test-service")
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Setup returned a nil shutdown — the batcher would never flush on exit")
	}
	t.Cleanup(func() { otel.SetTracerProvider(before) })

	// The global must actually change. Building a provider and forgetting to
	// register it is the whole failure this guards.
	if otel.GetTracerProvider() == before {
		t.Error("Setup did not install its tracer provider globally")
	}

	// A span through the global provider must reach a real implementation, not
	// the no-op one.
	_, span := otel.Tracer("t").Start(ctx, "probe")
	if !span.SpanContext().IsValid() {
		t.Error("span context is invalid — spans are going to a no-op provider")
	}
	span.End()

	if err := shutdown(ctx); err != nil {
		t.Errorf("shutdown: %v", err)
	}
}

func TestShutdownIsSafeToCallTwice(t *testing.T) {
	before := otel.GetTracerProvider()
	ctx := context.Background()
	shutdown, err := Setup(ctx, "test-service")
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	t.Cleanup(func() { otel.SetTracerProvider(before) })

	if err := shutdown(ctx); err != nil {
		t.Fatalf("first shutdown: %v", err)
	}
	// A signal handler and a deferred call both firing is ordinary; the second
	// must not error or panic, or the process exits non-zero after a clean run.
	if err := shutdown(ctx); err != nil {
		t.Errorf("second shutdown: %v", err)
	}
}
