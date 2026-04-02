package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository implements Repository using PostgreSQL via pgx v5.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new PostgresRepository connected to the
// given database URL. The connection pool is configured and validated before
// returning.
func NewPostgresRepository(ctx context.Context, databaseURL string) (*PostgresRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return &PostgresRepository{pool: pool}, nil
}

// List returns all examples ordered by creation time.
func (r *PostgresRepository) List(ctx context.Context) ([]*Example, error) {
	rows, err := r.pool.Query(ctx,
		"SELECT id, name, value, created_at, updated_at FROM examples ORDER BY created_at DESC")
	if err != nil {
		return nil, fmt.Errorf("querying examples: %w", err)
	}
	defer rows.Close()

	var examples []*Example
	for rows.Next() {
		e := &Example{}
		if err := rows.Scan(&e.ID, &e.Name, &e.Value, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning example: %w", err)
		}
		examples = append(examples, e)
	}

	return examples, rows.Err()
}

// Get returns a single example by ID.
func (r *PostgresRepository) Get(ctx context.Context, id string) (*Example, error) {
	e := &Example{}
	err := r.pool.QueryRow(ctx,
		"SELECT id, name, value, created_at, updated_at FROM examples WHERE id = $1", id).
		Scan(&e.ID, &e.Name, &e.Value, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("getting example %s: %w", id, err)
	}
	return e, nil
}

// Create inserts a new example.
func (r *PostgresRepository) Create(ctx context.Context, e *Example) error {
	now := time.Now()
	e.CreatedAt = now
	e.UpdatedAt = now

	_, err := r.pool.Exec(ctx,
		"INSERT INTO examples (id, name, value, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
		e.ID, e.Name, e.Value, e.CreatedAt, e.UpdatedAt)
	if err != nil {
		return fmt.Errorf("creating example: %w", err)
	}
	return nil
}

// Update modifies an existing example.
func (r *PostgresRepository) Update(ctx context.Context, e *Example) error {
	e.UpdatedAt = time.Now()

	result, err := r.pool.Exec(ctx,
		"UPDATE examples SET name = $1, value = $2, updated_at = $3 WHERE id = $4",
		e.Name, e.Value, e.UpdatedAt, e.ID)
	if err != nil {
		return fmt.Errorf("updating example %s: %w", e.ID, err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("example %s not found", e.ID)
	}
	return nil
}

// Delete removes an example by ID.
func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, "DELETE FROM examples WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("deleting example %s: %w", id, err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("example %s not found", id)
	}
	return nil
}

// Close shuts down the connection pool.
func (r *PostgresRepository) Close() error {
	r.pool.Close()
	return nil
}
