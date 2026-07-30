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

# Coverage floor. standards/testing-rubric.json publishes 75 and says to encode
# it where a regression fails the build rather than as a CI flag. This suite
# clears it. The remainder is the JWKS happy path in the auth0 and clerk
# providers, which fetches a signing key over the network; their configuration
# handling — the half that decides whether a deploy starts at all — is covered.
COVERAGE_MIN := 80

test:
	go test ./... -coverprofile=coverage.out
	@total=$$(go tool cover -func=coverage.out | awk '/^total:/ {gsub(/%/,"",$$3); print $$3}'); \
	awk -v t="$$total" -v m="$(COVERAGE_MIN)" 'BEGIN { \
	  if (t+0 < m+0) { printf "coverage %s%% is below the %s%% floor\n", t, m; exit 1 } \
	  printf "coverage %s%% (floor %s%%)\n", t, m }'

test-race:
	go test -race ./...

vet:
	go vet ./...

fmt:
	gofmt -w .
