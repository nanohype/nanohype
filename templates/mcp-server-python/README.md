# mcp-server-python

Scaffolds a [Model Context Protocol](https://modelcontextprotocol.io) server in Python using the official `mcp` SDK and FastMCP.

## What you get

- A working MCP server with example tools and resources
- Transport selection: stdio for CLI-based clients, http for network access
- Pydantic-based input validation on all tool parameters
- structlog for structured JSON logging to stderr
- Factory pattern with instance-scoped registries (no module-level mutable state)
- pytest test suite with server lifecycle and tool execution tests

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `Description` | string | `"An MCP server in Python"` | Short project description |
| `Transport` | string | `"stdio"` | Transport protocol: `stdio` or `http` |
| `IncludeTests` | bool | `true` | Include test suite with pytest |

## Project layout

```text
<ProjectName>/
  src/
    main.py                  # Entry point, transport selection
    server.py                # MCP server factory and registration
    config.py                # Pydantic BaseSettings for env vars
    logger.py                # structlog JSON logger
    tools/
      registry.py            # Tool registration helpers
      example.py             # Example tool with Pydantic validation
    resources/
      registry.py            # Resource registration helpers
      example.py             # Example resource provider
    transports/
      stdio.py               # Stdio transport
      http.py                # Streamable HTTP transport
  tests/                     # Test suite (conditional)
    conftest.py              # Shared fixtures
    test_server.py           # Server lifecycle tests
    test_tools.py            # Tool execution tests
  pyproject.toml
  .env.example
  .gitignore
  README.md
```

## Prerequisites

- Python >= 3.10
- pip

## After scaffolding

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
python -m src.main
```

## Adding tools

Create a new file in `src/tools/` following the pattern in `src/tools/example.py`, then register it in `src/server.py`.

## Adding resources

Create a new file in `src/resources/` following the pattern in `src/resources/example.py`, then register it in `src/server.py`.

## Pairs with

- [agentic-loop](../agentic-loop/) -- build an agentic loop that calls your MCP server's tools
- [eval-harness](../eval-harness/) -- evaluate tool server responses

## Nests inside

- [monorepo](../monorepo/)
