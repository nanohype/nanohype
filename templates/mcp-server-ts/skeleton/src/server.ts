import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExampleTool } from "./tools/example.js";
import { registerExampleResource } from "./resources/example.js";
import { logger } from "./logger.js";

/**
 * Create and configure the MCP server.
 *
 * All tool and resource registrations happen here. The server is
 * transport-agnostic — the caller in index.ts decides how to connect it.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "__SERVER_NAME__",
    version: "0.1.0",
  });

  logger.info("server.start", { name: "__SERVER_NAME__" });

  // ── Tools ───────────────────────────────────────────────────────────
  // Each tool is registered via a helper function that receives the
  // server instance. Add new tools by creating a file in src/tools/
  // and calling its registration function here.
  registerExampleTool(server);
  logger.info("server.tool_registered", { name: "greet" });

  // ── Resources ───────────────────────────────────────────────────────
  // Resources expose data that MCP clients can read. Remove this section
  // if you opted out of resource examples during scaffolding.
  registerExampleResource(server);

  return server;
}
