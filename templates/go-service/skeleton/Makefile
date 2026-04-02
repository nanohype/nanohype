BINARY := __PROJECT_NAME__
MODULE := __GO_MODULE__

.PHONY: build test lint fmt clean run

build:
	go build -o $(BINARY) ./cmd/server

run: build
	./$(BINARY)

test:
	go test ./...

lint:
	golangci-lint run ./...

fmt:
	gofmt -w .

clean:
	rm -f $(BINARY)
