# __SERVER_NAME__

__DESCRIPTION__

A [Model Context Protocol](https://modelcontextprotocol.io) server built with TypeScript and the official MCP SDK.

## Getting Started

```bash
npm install
npm run build
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Launch MCP Inspector for interactive debugging
npm run inspect
```

## Usage

### stdio transport

Add this server to your MCP client configuration. For example, in Claude Desktop's config:

```json
{
  "mcpServers": {
    "__PROJECT_NAME__": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

### streamable-http transport

If configured for HTTP transport, start the server and connect your MCP client to the endpoint:

```bash
npm start
# Server listens on http://localhost:3000/mcp
```

## Available Tools

### greet

Generate a greeting message for a given name.

**Parameters:**
- `name` (string, required) — The name of the person to greet
- `enthusiasm` (enum: low/medium/high, default: medium) — How enthusiastic the greeting should be

## Adding Tools

1. Create a new file in `src/tools/` following the pattern in `src/tools/example.ts`
2. Export a registration function that takes the `McpServer` instance
3. Call your registration function in `src/server.ts`

## Adding Resources

1. Create a new file in `src/resources/` following the pattern in `src/resources/example.ts`
2. Export a registration function that takes the `McpServer` instance
3. Call your registration function in `src/server.ts`

## Project Structure

```
src/
  index.ts              # Entrypoint — transport setup
  server.ts             # Server creation and registration
  tools/
    example.ts          # Example tool implementation
  resources/
    example.ts          # Example resource implementation
```
