package auth

import (
	"context"
	"testing"
)

func TestUserHasRole(t *testing.T) {
	u := &User{Roles: []string{"admin", "billing"}}
	if !u.HasRole("admin") {
		t.Fatal("expected admin role")
	}
	if u.HasRole("viewer") {
		t.Fatal("did not expect viewer role")
	}
}

func TestContextRoundTrip(t *testing.T) {
	ctx := WithUser(context.Background(), &User{ID: "u-1"})
	got, ok := FromContext(ctx)
	if !ok {
		t.Fatal("expected user in context")
	}
	if got.ID != "u-1" {
		t.Fatalf("expected id u-1, got %q", got.ID)
	}
}

func TestContextMissing(t *testing.T) {
	if _, ok := FromContext(context.Background()); ok {
		t.Fatal("expected no user in bare context")
	}
}
