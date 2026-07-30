BINARY := __PROJECT_NAME__
MODULE := __GO_MODULE__

.PHONY: build test lint fmt clean

build:
	go build -o $(BINARY) .

# Coverage floor. standards/testing-rubric.json publishes 75 and says to encode
# it where a regression fails the build rather than as a CI flag. This suite
# clears it: main.go is the entrypoint and holds no logic, so the reachable
# ceiling is a little under 90.
COVERAGE_MIN := 85

test:
	go test ./... -coverprofile=coverage.out
	@total=$$(go tool cover -func=coverage.out | awk '/^total:/ {gsub(/%/,"",$$3); print $$3}'); \
	awk -v t="$$total" -v m="$(COVERAGE_MIN)" 'BEGIN { \
	  if (t+0 < m+0) { printf "coverage %s%% is below the %s%% floor\n", t, m; exit 1 } \
	  printf "coverage %s%% (floor %s%%)\n", t, m }'

lint:
	golangci-lint run ./...

fmt:
	gofmt -w .

clean:
	rm -f $(BINARY)
