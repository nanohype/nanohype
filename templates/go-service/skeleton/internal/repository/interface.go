package repository

import (
	"context"
	"time"
)

// Example represents the example domain entity.
type Example struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Value     string    `json:"value"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Repository defines the interface for persistent storage of examples.
// Implementations exist for PostgreSQL and SQLite.
type Repository interface {
	List(ctx context.Context) ([]*Example, error)
	Get(ctx context.Context, id string) (*Example, error)
	Create(ctx context.Context, e *Example) error
	Update(ctx context.Context, e *Example) error
	Delete(ctx context.Context, id string) error
	Close() error
}
