# __PROJECT_NAME__

__DESCRIPTION__

## Installation

### From source

```bash
go install __GO_MODULE__@latest
```

### From release (if release automation is enabled)

Download the latest binary from the [Releases](https://github.com/__ORG__/__PROJECT_NAME__/releases) page.

## Usage

```bash
# Show help
__PROJECT_NAME__ --help

# Show version and build info
__PROJECT_NAME__ version

# Run with verbose logging
__PROJECT_NAME__ --verbose

# Run with a specific config file
__PROJECT_NAME__ --config /path/to/config.yaml

# Run with a specific log format
__PROJECT_NAME__ --log-format text
```

## Configuration

Configuration is loaded from (in order of precedence):

1. Command-line flags
2. Environment variables (prefixed with `__PROJECT_NAME__` uppercased, hyphens replaced with underscores)
3. Config file (`$HOME/.__PROJECT_NAME__.yaml` or `./.__PROJECT_NAME__.yaml`)
4. Defaults

### Config file example

```yaml
log_format: json
verbose: false
```

### Environment variables

All environment variables are prefixed with the project name in uppercase with hyphens replaced by underscores.

| Variable | Description | Default |
|---|---|---|
| `<PREFIX>_LOG_FORMAT` | Log output format (json, text, pretty) | `__LOG_FORMAT__` |
| `<PREFIX>_VERBOSE` | Enable debug logging | `false` |

## Development

```bash
# Build the binary
make build

# Run tests
make test

# Run linter
make lint

# Format code
make fmt

# Clean build artifacts
make clean
```

## License

See [LICENSE](LICENSE) for details.
