import { z } from "zod";
import type { Tool } from "../tools/registry.js";

// ── Messages API Tool Definitions ───────────────────────────────────
//
// The tool definitions a Messages API request carries, built from the
// registry's zod input schemas. The gateway provider sends them to the
// Platform's ModelGateway, and the anthropic provider to the Anthropic
// API, so both describe a tool the same way.
//

/** One tool as a Messages API request declares it. */
export interface MessagesTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
  };
}

function zodTypeToJsonType(zodType: z.ZodTypeAny): string {
  if (zodType instanceof z.ZodNumber) return "number";
  if (zodType instanceof z.ZodBoolean) return "boolean";
  if (zodType instanceof z.ZodArray) return "array";
  if (zodType instanceof z.ZodObject) return "object";
  return "string";
}

/** The Messages API tool definitions for `tools`. */
export function formatTools(tools: Tool[]): MessagesTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.shape).map(([key, raw]) => {
          // zod 4's .shape yields the core $ZodType, which exposes neither the
          // description getter nor the public surface — one cast up front rather
          // than one per read.
          const zodType = raw as z.ZodType;
          return [
            key,
            {
              type: zodTypeToJsonType(zodType),
              description: String(zodType.description ?? key),
            },
          ];
        }),
      ),
    },
  }));
}
