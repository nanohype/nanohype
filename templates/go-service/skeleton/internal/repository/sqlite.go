package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// SQLiteRepository implements Repository using SQLite via go-sqlite3.
type SQLiteRepository struct {
	db *sql.DB
}

// NewSQLiteRepository creates a new SQLiteRepository connected to the given
// database path. It creates the examples table if it does not exist.
func NewSQLiteRepository(ctx context.Context, dbPath string) (*SQLiteRepository, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite database: %w", err)
	}

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("pinging sqlite database: %w", err)
	}

	_, err = db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS examples (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			value      TEXT NOT NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)
	`)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("creating examples table: %w", err)
	}

	return &SQLiteRepository{db: db}, nil
}

// List returns all examples ordered by creation time.
func (r *SQLiteRepository) List(ctx context.Context) ([]*Example, error) {
	rows, err := r.db.QueryContext(ctx,
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
func (r *SQLiteRepository) Get(ctx context.Context, id string) (*Example, error) {
	e := &Example{}
	err := r.db.QueryRowContext(ctx,
		"SELECT id, name, value, created_at, updated_at FROM examples WHERE id = ?", id).
		Scan(&e.ID, &e.Name, &e.Value, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("getting example %s: %w", id, err)
	}
	return e, nil
}

// Create inserts a new example.
func (r *SQLiteRepository) Create(ctx context.Context, e *Example) error {
	now := time.Now()
	e.CreatedAt = now
	e.UpdatedAt = now

	_, err := r.db.ExecContext(ctx,
		"INSERT INTO examples (id, name, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		e.ID, e.Name, e.Value, e.CreatedAt, e.UpdatedAt)
	if err != nil {
		return fmt.Errorf("creating example: %w", err)
	}
	return nil
}

// Update modifies an existing example.
func (r *SQLiteRepository) Update(ctx context.Context, e *Example) error {
	e.UpdatedAt = time.Now()

	result, err := r.db.ExecContext(ctx,
		"UPDATE examples SET name = ?, value = ?, updated_at = ? WHERE id = ?",
		e.Name, e.Value, e.UpdatedAt, e.ID)
	if err != nil {
		return fmt.Errorf("updating example %s: %w", e.ID, err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("example %s not found", e.ID)
	}
	return nil
}

// Delete removes an example by ID.
func (r *SQLiteRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, "DELETE FROM examples WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("deleting example %s: %w", id, err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("example %s not found", id)
	}
	return nil
}

// Close shuts down the database connection.
func (r *SQLiteRepository) Close() error {
	return r.db.Close()
}
