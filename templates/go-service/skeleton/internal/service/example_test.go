package service

import (
	"context"
	"strconv"
	"sync"
	"testing"
)

// The service owns the in-memory store the skeleton starts on, so its
// invariants are the ones a consumer inherits before wiring a real repository:
// ids are unique and monotonic, a miss is an error rather than a zero value,
// and concurrent handlers do not race. The mutex is the reason the last one is
// worth an explicit test — it is correct here, and it is exactly what a
// refactor drops.

func TestCreateAssignsDistinctIncrementingIDs(t *testing.T) {
	s := NewExampleService()
	ctx := context.Background()

	seen := map[string]bool{}
	for i := range 5 {
		e, err := s.Create(ctx, ExampleInput{Name: "n" + strconv.Itoa(i), Value: "v"})
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if seen[e.ID] {
			t.Fatalf("id %q was issued twice", e.ID)
		}
		seen[e.ID] = true
		if e.CreatedAt.IsZero() || e.UpdatedAt.IsZero() {
			t.Error("timestamps were not set on create")
		}
		if !e.CreatedAt.Equal(e.UpdatedAt) {
			t.Error("CreatedAt and UpdatedAt should match on a fresh record")
		}
	}
}

func TestGetReturnsAnErrorForAnUnknownID(t *testing.T) {
	s := NewExampleService()
	// A nil, nil return here would surface as a nil dereference in the handler
	// rather than as a 404.
	got, err := s.Get(context.Background(), "does-not-exist")
	if err == nil {
		t.Fatal("Get returned no error for a missing id")
	}
	if got != nil {
		t.Errorf("Get returned %+v alongside an error", got)
	}
}

func TestListReflectsCreatesAndDeletes(t *testing.T) {
	s := NewExampleService()
	ctx := context.Background()

	if got, err := s.List(ctx); err != nil || len(got) != 0 {
		t.Fatalf("empty store: got %d items, err %v — want an empty non-nil slice", len(got), err)
	}

	a, _ := s.Create(ctx, ExampleInput{Name: "a"})
	_, _ = s.Create(ctx, ExampleInput{Name: "b"})

	if got, _ := s.List(ctx); len(got) != 2 {
		t.Fatalf("List returned %d items, want 2", len(got))
	}

	if err := s.Delete(ctx, a.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got, _ := s.List(ctx); len(got) != 1 {
		t.Errorf("List returned %d items after a delete, want 1", len(got))
	}
	if _, err := s.Get(ctx, a.ID); err == nil {
		t.Error("Get found a deleted record")
	}
}

func TestDeleteIsNotIdempotent(t *testing.T) {
	s := NewExampleService()
	ctx := context.Background()
	e, _ := s.Create(ctx, ExampleInput{Name: "a"})

	if err := s.Delete(ctx, e.ID); err != nil {
		t.Fatalf("first Delete: %v", err)
	}
	// Deliberate: the second delete reports not-found so the handler can answer
	// 404 rather than 204. Pinned because "make delete idempotent" is a common
	// change that alters the API contract.
	if err := s.Delete(ctx, e.ID); err == nil {
		t.Error("second Delete succeeded; a missing record should be an error")
	}
}

func TestUpdateReplacesFieldsAndMovesUpdatedAt(t *testing.T) {
	s := NewExampleService()
	ctx := context.Background()
	created, _ := s.Create(ctx, ExampleInput{Name: "before", Value: "v1"})
	createdAt := created.CreatedAt

	updated, err := s.Update(ctx, created.ID, ExampleInput{Name: "after", Value: "v2"})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "after" || updated.Value != "v2" {
		t.Errorf("fields not applied: %+v", updated)
	}
	// CreatedAt is immutable; overwriting it loses the record's age, which is
	// invisible until someone sorts or audits by it.
	if !updated.CreatedAt.Equal(createdAt) {
		t.Error("Update changed CreatedAt")
	}
	if updated.UpdatedAt.Before(createdAt) {
		t.Error("UpdatedAt moved backwards")
	}
}

func TestUpdateOnAMissingIDIsAnError(t *testing.T) {
	s := NewExampleService()
	if _, err := s.Update(context.Background(), "nope", ExampleInput{Name: "x"}); err == nil {
		t.Fatal("Update created a record for an unknown id")
	}
}

func TestConcurrentCreatesDoNotRaceOrCollide(t *testing.T) {
	// Run with -race in CI. Without the mutex this both races on the map and
	// duplicates ids from the unguarded seq++.
	s := NewExampleService()
	ctx := context.Background()

	const n = 50
	var wg sync.WaitGroup
	ids := make([]string, n)
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e, err := s.Create(ctx, ExampleInput{Name: "concurrent"})
			if err == nil {
				ids[i] = e.ID
			}
		}()
	}
	wg.Wait()

	seen := map[string]bool{}
	for _, id := range ids {
		if id == "" {
			t.Fatal("a concurrent Create failed")
		}
		if seen[id] {
			t.Fatalf("id %q was issued to two concurrent creates", id)
		}
		seen[id] = true
	}
	if got, _ := s.List(ctx); len(got) != n {
		t.Errorf("List returned %d records, want %d", len(got), n)
	}
}
