package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"

	"__GO_MODULE__/internal/repository"
)

var tracer = otel.Tracer("__GO_MODULE__/internal/service")

// ExampleInput represents the input for creating or updating an example.
type ExampleInput struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// ExampleService contains the business logic for managing examples.
type ExampleService struct {
	mu    sync.RWMutex
	store map[string]*repository.Example
	seq   int
}

// NewExampleService creates a new ExampleService with an in-memory store.
// Replace with a repository.Repository implementation for persistent storage.
func NewExampleService() *ExampleService {
	return &ExampleService{
		store: make(map[string]*repository.Example),
	}
}

// List returns all examples.
func (s *ExampleService) List(ctx context.Context) ([]*repository.Example, error) {
	ctx, span := tracer.Start(ctx, "ExampleService.List")
	defer span.End()

	s.mu.RLock()
	defer s.mu.RUnlock()

	examples := make([]*repository.Example, 0, len(s.store))
	for _, e := range s.store {
		examples = append(examples, e)
	}

	span.SetAttributes(attribute.Int("count", len(examples)))
	return examples, nil
}

// Get returns a single example by ID.
func (s *ExampleService) Get(ctx context.Context, id string) (*repository.Example, error) {
	ctx, span := tracer.Start(ctx, "ExampleService.Get")
	defer span.End()

	span.SetAttributes(attribute.String("id", id))

	s.mu.RLock()
	defer s.mu.RUnlock()

	example, ok := s.store[id]
	if !ok {
		return nil, fmt.Errorf("example %s not found", id)
	}
	return example, nil
}

// Create adds a new example.
func (s *ExampleService) Create(ctx context.Context, input ExampleInput) (*repository.Example, error) {
	ctx, span := tracer.Start(ctx, "ExampleService.Create")
	defer span.End()

	s.mu.Lock()
	defer s.mu.Unlock()

	s.seq++
	id := fmt.Sprintf("%d", s.seq)
	now := time.Now()

	example := &repository.Example{
		ID:        id,
		Name:      input.Name,
		Value:     input.Value,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.store[id] = example

	span.SetAttributes(attribute.String("id", id))
	return example, nil
}

// Update modifies an existing example.
func (s *ExampleService) Update(ctx context.Context, id string, input ExampleInput) (*repository.Example, error) {
	ctx, span := tracer.Start(ctx, "ExampleService.Update")
	defer span.End()

	span.SetAttributes(attribute.String("id", id))

	s.mu.Lock()
	defer s.mu.Unlock()

	example, ok := s.store[id]
	if !ok {
		return nil, fmt.Errorf("example %s not found", id)
	}

	example.Name = input.Name
	example.Value = input.Value
	example.UpdatedAt = time.Now()

	return example, nil
}

// Delete removes an example by ID.
func (s *ExampleService) Delete(ctx context.Context, id string) error {
	ctx, span := tracer.Start(ctx, "ExampleService.Delete")
	defer span.End()

	span.SetAttributes(attribute.String("id", id))

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.store[id]; !ok {
		return fmt.Errorf("example %s not found", id)
	}

	delete(s.store, id)
	return nil
}
