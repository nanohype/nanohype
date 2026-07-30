package repository

import (
	"context"
	"strings"
	"testing"
	"time"
)

// PostgreSQL's CRUD methods need a live server, so they belong to the
// integration tier rather than here — mocking pgx would assert that the mock
// was called, not that the SQL is right, which is the only thing worth knowing
// about a repository.
//
// What is unit-testable is the constructor's failure handling, and it is worth
// testing: a service that starts with an unreachable database and only finds
// out on the first request looks healthy to its readiness probe.

func TestNewPostgresRepositoryRejectsAMalformedURL(t *testing.T) {
	// pgxpool.New parses the DSN eagerly, so this fails without any network.
	_, err := NewPostgresRepository(context.Background(), "not-a-valid-dsn://%%%")
	if err == nil {
		t.Fatal("NewPostgresRepository accepted a malformed connection string")
	}
	if !strings.Contains(err.Error(), "connection pool") {
		t.Errorf("error %q does not say which stage failed", err)
	}
}

func TestNewPostgresRepositoryFailsWhenTheServerIsUnreachable(t *testing.T) {
	// A well-formed DSN pointing at a closed port. The constructor must Ping
	// and fail rather than hand back a pool that errors on first use — the
	// difference between a container that crash-loops visibly and one that
	// serves 500s.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := NewPostgresRepository(ctx, "postgres://user:pass@127.0.0.1:1/db?sslmode=disable&connect_timeout=1")
	if err == nil {
		t.Fatal("NewPostgresRepository succeeded against an unreachable server")
	}
	if !strings.Contains(err.Error(), "pinging") {
		t.Errorf("error %q does not identify the ping as the failing stage", err)
	}
}
