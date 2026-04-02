import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tool } from "../tools/registry.js";
import type {
  LlmProvider,
  Message,
  ContentBlock,
  ToolCall,
  LlmResponse,
} from "./types.js";
import { registerProvider } from "./registry.js";

const client = new Anthropic();

function zodTypeToJsonType(zodType: z.ZodTypeAny): string {
  if (zodType instanceof z.ZodNumber) return "number";
  if (zodType instanceof z.ZodBoolean) return "boolean";
  if (zodType instanceof z.ZodArray) return "array";
  if (zodType instanceof z.ZodObject) return "object";
  return "string";
}

function formatTools(
  tools: Tool[],
): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.shape).map(([key, zodType]) => [
          key,
          {
            type: zodTypeToJsonType(zodType as z.ZodTypeAny),
            description: String(zodType.description ?? key),
          },
        ]),
      ),
    },
  }));
}

class AnthropicProvider implements LlmProvider {
  async sendMessage(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[],
  ): Promise<LlmResponse> {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as Anthropic.Messages.MessageParam[],
      tools: formatTools(tools),
    });

    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const rawAssistantMessage: Message = {
      role: "assistant",
      content: response.content as ContentBlock[],
    };

    return {
      content: response.content as ContentBlock[],
      toolCalls,
      stopReason: response.stop_reason ?? "end_turn",
      rawAssistantMessage,
    };
  }

  makeToolResultMessage(toolCallId: string, result: string): Message {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolCallId,
          content: result,
        },
      ],
    };
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
