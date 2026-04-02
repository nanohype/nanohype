BINARY := __PROJECT_NAME__
MODULE := __GO_MODULE__

.PHONY: build test lint fmt clean

build:
	go build -o $(BINARY) .

test:
	go test ./...

lint:
	golangci-lint run ./...

fmt:
	gofmt -w .

clean:
	rm -f $(BINARY)
