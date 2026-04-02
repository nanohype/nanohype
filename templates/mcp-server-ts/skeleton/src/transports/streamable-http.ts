import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../logger.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

/**
 * Start the MCP server using streamable-http transport.
 *
 * Exposes an HTTP endpoint at /mcp that MCP clients connect to over
 * the network. Use this when the server runs as a standalone service
 * rather than a client-spawned subprocess.
 */
export async function start(server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  await server.connect(transport);

  app.listen(PORT, () => {
    logger.info("server.transport", {
      transport: "streamable-http",
      url: `http://localhost:${PORT}/mcp`,
    });
  });
}
