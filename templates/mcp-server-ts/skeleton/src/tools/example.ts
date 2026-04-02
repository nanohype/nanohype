import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../logger.js";

/**
 * Register the "greet" example tool with the MCP server.
 *
 * This demonstrates the standard pattern for defining a tool:
 *
 *   1. Define the tool name and description
 *   2. Declare the input schema using Zod for runtime validation
 *   3. Implement the handler that returns structured content
 *
 * To add your own tool, copy this file, change the name/schema/handler,
 * and register it in src/server.ts.
 */
export function registerExampleTool(server: McpServer): void {
  server.tool(
    // Tool name — this is what MCP clients see and invoke.
    "greet",

    // Description — helps the LLM understand when to use this tool.
    "Generate a greeting message for a given name. " +
      "Use this when the user wants to say hello to someone.",

    // Input schema — Zod validates parameters before the handler runs.
    // The SDK converts this to JSON Schema for the MCP protocol.
    {
      name: z
        .string()
        .min(1)
        .describe("The name of the person to greet"),
      enthusiasm: z
        .enum(["low", "medium", "high"])
        .default("medium")
        .describe("How enthusiastic the greeting should be"),
    },

    // Handler — receives the validated input and returns content blocks.
    async ({ name, enthusiasm }) => {
      logger.debug("tool.execute", { name: "greet", input: { name, enthusiasm } });
      try {
        const greeting = formatGreeting(name, enthusiasm);

        return {
          content: [
            {
              type: "text" as const,
              text: greeting,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}

/** Format a greeting with the appropriate level of enthusiasm. */
function formatGreeting(
  name: string,
  enthusiasm: "low" | "medium" | "high",
): string {
  switch (enthusiasm) {
    case "low":
      return `Hello, ${name}.`;
    case "medium":
      return `Hello, ${name}! Welcome to __SERVER_NAME__.`;
    case "high":
      return `HELLO, ${name}!!! SO GREAT to have you here at __SERVER_NAME__!!! 🎉`;
  }
}
