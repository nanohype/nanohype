import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register the "server-info" example resource with the MCP server.
 *
 * This demonstrates the standard pattern for defining a resource:
 *
 *   1. Define a URI template with parameters (or a fixed URI)
 *   2. Provide metadata describing what the resource contains
 *   3. Implement the handler that returns structured content
 *
 * Resources are read-only data endpoints. MCP clients can list them
 * and read their contents. Unlike tools, resources are not invoked
 * by the LLM — they provide context that can be attached to the
 * conversation.
 *
 * To add your own resource, copy this file, change the URI/handler,
 * and register it in src/server.ts.
 */
export function registerExampleResource(server: McpServer): void {
  // ── Fixed Resource ──────────────────────────────────────────────────
  // A resource with a static URI. Every read returns the same structure
  // (though the content can be dynamic).
  server.resource(
    // Resource name — for display in client UIs.
    "server-info",

    // URI — a fixed URI that clients use to read this resource.
    "info://server",

    // Metadata — describes what this resource provides.
    {
      description:
        "Basic information about this MCP server, including its name and capabilities.",
      mimeType: "application/json",
    },

    // Handler — returns content blocks, similar to tool responses.
    async () => {
      const info = {
        name: "__SERVER_NAME__",
        version: "0.1.0",
        description: "__DESCRIPTION__",
        transport: "__TRANSPORT__",
      };

      return {
        contents: [
          {
            uri: "info://server",
            mimeType: "application/json",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  );
}
