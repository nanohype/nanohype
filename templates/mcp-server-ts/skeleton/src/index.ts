import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// ── Transport Configuration ─────────────────────────────────────────
//
// This server is configured for "__TRANSPORT__" transport.
//
// stdio  — Communicates over stdin/stdout. Use this when the MCP client
//          launches the server as a subprocess (Claude Desktop, Cursor, etc.).
//
// streamable-http — Exposes an HTTP endpoint that MCP clients connect to
//                   over the network. Requires an HTTP server (see below).
//

const server = createServer();

async function main(): Promise<void> {
  // To switch transports, replace the transport setup below.
  //
  // ── stdio transport ────────────────────────────────────────────────
  // The simplest option. The MCP client spawns this process and
  // communicates over stdin/stdout.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`__SERVER_NAME__ running on stdio`);

  // ── streamable-http transport (alternative) ────────────────────────
  // Uncomment the block below and comment out the stdio block above
  // to serve over HTTP instead. You will need to install express:
  //
  //   npm install express @types/express
  //
  // import express from "express";
  // import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
  //
  // const app = express();
  // app.use(express.json());
  //
  // const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  // app.post("/mcp", async (req, res) => {
  //   await transport.handleRequest(req, res, req.body);
  // });
  //
  // await server.connect(transport);
  //
  // const PORT = process.env.PORT ?? 3000;
  // app.listen(PORT, () => {
  //   console.error(`__SERVER_NAME__ listening on http://localhost:${PORT}/mcp`);
  // });
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
