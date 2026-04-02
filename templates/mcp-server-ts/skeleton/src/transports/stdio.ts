import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../logger.js";

/**
 * Start the MCP server using stdio transport.
 *
 * The MCP client spawns this process as a subprocess and communicates
 * over stdin/stdout. This is the standard transport for desktop
 * integrations (Claude Desktop, Cursor, etc.).
 */
export async function start(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server.transport", { transport: "stdio" });
}
