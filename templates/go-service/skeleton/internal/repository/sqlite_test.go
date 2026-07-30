package repository

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

// The SQLite implementation is exercised against a real database rather than a
// mock. The whole value of a repository test is that the SQL is correct — column
// order, the ORDER BY, whether an UPDATE that matched nothing reports it — and a
// mock asserts none of that. go-sqlite3 opens a file per test with no external
// service, so the fidelity is free.
//
// The PostgreSQL implementation mirrors this one but needs a live server, so it
// is covered by the integration tier rather than here.

func newRepo(t *testing.T) *SQLiteRepository {
	t.Helper()
	// A file in the test's temp dir rather than ":memory:": database/sql pools
	// connections, and each new connection to :memory: gets its own empty
	// database, so a table created on one connection is missing on the next.
	path := filepath.Join(t.TempDir(), "test.db")
	repo, err := NewSQLiteRepository(context.Background(), path)
	if err != nil {
		t.Fatalf("NewSQLiteRepository: %v", err)
	}
	t.Cleanup(func() { _ = repo.Close() })
	return repo
}

// seed inserts a row. Create stamps its own CreatedAt/UpdatedAt — the
// repository is the clock, not the caller — so no time is passed in.
func seed(t *testing.T, r *SQLiteRepository, id string) *Example {
	t.Helper()
	e := &Example{ID: id, Name: "name-" + id, Value: "value-" + id}
	if err := r.Create(context.Background(), e); err != nil {
		t.Fatalf("Create(%s): %v", id, err)
	}
	return e
}

func TestNewSQLiteRepositoryIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "twice.db")
	ctx := context.Background()

	first, err := NewSQLiteRepository(ctx, path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	seed(t, first, "keep")
	_ = first.Close()

	// CREATE TABLE IF NOT EXISTS — reopening an existing database must not fail
	// or wipe it. A plain CREATE TABLE here means the service starts once.
	second, err := NewSQLiteRepository(ctx, path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer second.Close()

	if _, err := second.Get(ctx, "keep"); err != nil {
		t.Errorf("row from the first open is gone after reopening: %v", err)
	}
}

func TestNewSQLiteRepositoryRejectsAnUnusablePath(t *testing.T) {
	// A directory that does not exist. The constructor must fail rather than
	// hand back a repository whose every call errors.
	_, err := NewSQLiteRepository(context.Background(), filepath.Join(t.TempDir(), "missing", "x.db"))
	if err == nil {
		t.Fatal("NewSQLiteRepository accepted an unusable path")
	}
}

func TestCreateGetRoundTrip(t *testing.T) {
	r := newRepo(t)
	ctx := context.Background()
	before := time.Now()
	written := seed(t, r, "a")

	got, err := r.Get(ctx, "a")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "name-a" || got.Value != "value-a" {
		t.Errorf("round trip lost fields: %+v", got)
	}
	// Column order in the SELECT has to match the Scan targets. Swapping two
	// same-typed columns compiles, runs, and returns the wrong data — so the
	// timestamp is compared to the one Create stamped, not just checked
	// non-zero.
	if !got.CreatedAt.Equal(written.CreatedAt) {
		t.Errorf("CreatedAt = %v, want the stamped %v", got.CreatedAt, written.CreatedAt)
	}
	if got.CreatedAt.Before(before) {
		t.Error("CreatedAt predates the call that created the row")
	}
}

func TestCreateStampsItsOwnTimestamps(t *testing.T) {
	r := newRepo(t)
	// The repository is the clock. A caller-supplied time is overwritten, which
	// is what keeps created_at trustworthy for ordering and auditing even when
	// a handler passes a zero value or a client-supplied one.
	stale := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	e := &Example{ID: "x", Name: "n", Value: "v", CreatedAt: stale, UpdatedAt: stale}
	if err := r.Create(context.Background(), e); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if e.CreatedAt.Equal(stale) {
		t.Error("Create kept the caller's CreatedAt")
	}
	if !e.CreatedAt.Equal(e.UpdatedAt) {
		t.Error("CreatedAt and UpdatedAt should match on insert")
	}
}

func TestGetMissingRow(t *testing.T) {
	if _, err := newRepo(t).Get(context.Background(), "absent"); err == nil {
		t.Fatal("Get returned no error for a row that does not exist")
	}
}

func TestListIsOrderedNewestFirst(t *testing.T) {
	r := newRepo(t)
	// Create stamps its own time, so rows are separated by a short sleep rather
	// than by chosen timestamps. Without the gap the three could share a
	// created_at and the ordering assertion would be a coin flip.
	for _, id := range []string{"first", "second", "third"} {
		seed(t, r, id)
		time.Sleep(2 * time.Millisecond)
	}

	got, err := r.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("List returned %d rows, want 3", len(got))
	}
	// Newest first — the reverse of insertion order, so a missing ORDER BY
	// shows up rather than passing on whatever order the engine returns.
	want := []string{"third", "second", "first"}
	for i, id := range want {
		if got[i].ID != id {
			t.Errorf("position %d = %q, want %q (ORDER BY created_at DESC)", i, got[i].ID, id)
		}
	}
}

func TestListOnAnEmptyTable(t *testing.T) {
	got, err := newRepo(t).List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("List returned %d rows from an empty table", len(got))
	}
}

func TestUpdateChangesTheRow(t *testing.T) {
	r := newRepo(t)
	ctx := context.Background()
	e := seed(t, r, "a")

	e.Name = "renamed"
	e.Value = "changed"
	if err := r.Update(ctx, e); err != nil {
		t.Fatalf("Update: %v", err)
	}

	got, err := r.Get(ctx, "a")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "renamed" || got.Value != "changed" {
		t.Errorf("Update did not persist: %+v", got)
	}
}

func TestUpdateAMissingRowIsAnError(t *testing.T) {
	r := newRepo(t)
	// An UPDATE matching no rows is not a driver error — it succeeds with zero
	// rows affected. Reporting that as success is how a PUT to a deleted
	// resource returns 200 having written nothing.
	err := r.Update(context.Background(), &Example{
		ID: "absent", Name: "x", Value: "y",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	})
	if err == nil {
		t.Fatal("Update reported success for a row that does not exist")
	}
}

func TestDelete(t *testing.T) {
	r := newRepo(t)
	ctx := context.Background()
	seed(t, r, "a")

	if err := r.Delete(ctx, "a"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := r.Get(ctx, "a"); err == nil {
		t.Error("Get found a deleted row")
	}
	// Same reasoning as Update: DELETE matching nothing is not a driver error.
	if err := r.Delete(ctx, "a"); err == nil {
		t.Error("Delete reported success for a row that does not exist")
	}
}

func TestCloseIsSafeAndStopsFurtherUse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "closed.db")
	r, err := NewSQLiteRepository(context.Background(), path)
	if err != nil {
		t.Fatalf("NewSQLiteRepository: %v", err)
	}
	if err := r.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if _, err := r.List(context.Background()); err == nil {
		t.Error("List succeeded on a closed repository")
	}
}
