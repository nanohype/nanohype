import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { start as startStdio } from "./stdio.js";
import { start as startStreamableHttp } from "./streamable-http.js";

export type TransportName = "stdio" | "streamable-http";

type StartFn = (server: McpServer) => Promise<void>;

const transports: Record<TransportName, StartFn> = {
  stdio: startStdio,
  "streamable-http": startStreamableHttp,
};

function isTransportName(name: string): name is TransportName {
  return Object.prototype.hasOwnProperty.call(transports, name);
}

/**
 * The transport selected at scaffold time via the `Transport` variable.
 */
export const TRANSPORT: string = "__TRANSPORT__";

/**
 * Start the MCP server using the configured transport.
 */
export function start(server: McpServer): Promise<void> {
  if (!isTransportName(TRANSPORT)) {
    throw new Error(`Unknown transport: ${TRANSPORT}`);
  }
  return transports[TRANSPORT](server);
}
