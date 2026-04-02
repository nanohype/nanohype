# go-cli

Scaffolds a Go CLI application using [Cobra](https://github.com/spf13/cobra) for command structure, [Viper](https://github.com/spf13/viper) for configuration management, and `log/slog` from the standard library for structured logging.

## What you get

- A buildable CLI binary with a root command and `version` subcommand
- Configuration loading from file, environment variables, and flags via Viper
- Structured logging via `log/slog` with configurable format (json, text, pretty)
- A Makefile with build, test, lint, fmt, and clean targets
- GitHub Actions CI workflow (test, vet, golangci-lint)
- Optional GoReleaser configuration and release workflow

## Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `ProjectName` | string | yes | - | Kebab-case project name |
| `Org` | string | yes | - | GitHub org or username |
| `GoModule` | string | yes | `github.com/<Org>/<ProjectName>` | Full Go module path |
| `Description` | string | no | `A CLI application` | Short project description |
| `IncludeRelease` | bool | no | `true` | Include GoReleaser + release workflow |
| `LogFormat` | enum | no | `json` | Log format: json, text, or pretty |

## Project layout

```text
<ProjectName>/
  main.go                        # Entrypoint
  go.mod
  cmd/
    root.go                      # Root Cobra command with flags
    version.go                   # Version subcommand using runtime/debug
  internal/
    config/
      config.go                  # Viper-based configuration
  .github/
    workflows/
      ci.yml                     # CI: test, vet, lint
      release.yml                # Release via GoReleaser (conditional)
  .goreleaser.yaml               # GoReleaser config (conditional)
  Makefile
  README.md
```

## Pairs with

- [eval-harness](../eval-harness/) -- test and evaluation framework
- [infra-fly](../infra-fly/) -- deploy to Fly.io

## Nests inside

- [monorepo](../monorepo/)
