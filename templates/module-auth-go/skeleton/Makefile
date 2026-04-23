.PHONY: help tidy build test test-race lint fmt vet

help:
	@echo "Targets:"
	@echo "  tidy       go mod tidy"
	@echo "  build      compile all packages (no artifacts — library module)"
	@echo "  test       run unit tests"
	@echo "  test-race  run unit tests with the race detector"
	@echo "  vet        run go vet"
	@echo "  fmt        gofmt -w on all .go files"

tidy:
	go mod tidy

build:
	go build ./...

test:
	go test ./...

test-race:
	go test -race ./...

vet:
	go vet ./...

fmt:
	gofmt -w .
