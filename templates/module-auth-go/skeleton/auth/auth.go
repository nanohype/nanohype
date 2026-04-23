// Package auth provides a framework-agnostic authentication layer for Go
// HTTP services. Consumers plug in a provider (JWT, Auth0, Clerk, Supabase,
// API key, or a custom implementation) and apply the resulting middleware
// to any net/http-compatible router (chi, gorilla/mux, stdlib ServeMux).
//
// Typical usage:
//
//	cfg := auth.Config{Provider: "jwt"}
//	mw, err := auth.Middleware(cfg)
//	if err != nil { ... }
//	r.Use(mw)
//	r.Handle("/api/profile", auth.RequireAuth(profileHandler))
//	r.Handle("/api/admin", auth.RequireAuth(auth.RequireRole("admin")(adminHandler)))
package auth

import "context"

// User represents an authenticated principal. Providers populate this
// struct from their respective token or header format.
type User struct {
	ID       string
	Email    string
	Roles    []string
	Metadata map[string]any
}

// HasRole reports whether the user has the named role.
func (u *User) HasRole(role string) bool {
	for _, r := range u.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// Config configures which provider the middleware uses. Provider must
// match the name of a registered provider (see providers package).
type Config struct {
	Provider string
}

// Result is the outcome of a provider's verify step. A provider that
// authenticates the request sets Authenticated=true and populates User;
// otherwise it sets Reason to a short human-readable string.
type Result struct {
	Authenticated bool
	User          *User
	Reason        string
}

type contextKey struct{ name string }

var userContextKey = contextKey{"auth.user"}

// WithUser returns a copy of ctx carrying the authenticated user.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

// FromContext extracts the authenticated user from ctx, if any.
func FromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(userContextKey).(*User)
	return u, ok
}
