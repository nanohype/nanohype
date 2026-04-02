# mcp-server-ts

Scaffolds a [Model Context Protocol](https://modelcontextprotocol.io) server in TypeScript using the official `@modelcontextprotocol/sdk`.

## What you get

- A working MCP server with example tools (and optionally resources)
- Transport selection: stdio for CLI-based clients, streamable-http for network access
- MCP Inspector integration for interactive debugging
- Zod-based input validation on all tool parameters
- Clean ESM TypeScript throughout, ready to extend

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | _(required)_ | Kebab-case project name |
| `ServerName` | string | _(required)_ | Human-readable server name for MCP clients |
| `Description` | string | `"An MCP server"` | Short project description |
| `Transport` | enum | `"stdio"` | Transport protocol: `stdio` or `streamable-http` |
| `IncludeResources` | bool | `true` | Include example resource endpoints |

## Project layout

```text
<ProjectName>/
  src/
    index.ts                 # Entrypoint
    server.ts                # MCP server setup and tool/resource registration
    tools/
      example.ts             # Example tool definition
    resources/
      example.ts             # Example resource endpoint (conditional)
    transports/              # Transport configuration (stdio or streamable-http)
  package.json
  tsconfig.json
  README.md
```

## Prerequisites

- Node.js >= 22
- npm

## After scaffolding

```bash
npm run dev        # start in development mode with tsx
npm run build      # compile TypeScript to dist/
npm start          # run compiled server
npm run inspect    # launch MCP Inspector for debugging
```

## Adding tools

Create a new file in `src/tools/` following the pattern in `src/tools/example.ts`, then register it in `src/server.ts`.

## Adding resources

Create a new file in `src/resources/` following the pattern in `src/resources/example.ts`, then register it in `src/server.ts`.

## Pairs with

- [agentic-loop](../agentic-loop/) -- build an agentic loop that calls your MCP server's tools
- [eval-harness](../eval-harness/) -- evaluate tool server responses

## Nests inside

- [monorepo](../monorepo/)
