import OpenAI from "openai";
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

const client = new OpenAI();

function zodTypeToJsonType(zodType: z.ZodTypeAny): string {
  if (zodType instanceof z.ZodNumber) return "number";
  if (zodType instanceof z.ZodBoolean) return "boolean";
  if (zodType instanceof z.ZodArray) return "array";
  if (zodType instanceof z.ZodObject) return "object";
  return "string";
}

function formatTools(
  tools: Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
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
    },
  }));
}

class OpenAIProvider implements LlmProvider {
  async sendMessage(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[],
  ): Promise<LlmResponse> {
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: openaiMessages,
      tools: formatTools(tools),
    });

    const choice = response.choices[0];
    if (!choice) {
      const emptyMsg: Message = { role: "assistant", content: "" };
      return { content: [], toolCalls: [], stopReason: "error", rawAssistantMessage: emptyMsg };
    }

    const toolCalls: ToolCall[] = [];
    const contentBlocks: ContentBlock[] = [];

    if (choice.message.content) {
      contentBlocks.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          parsed = { _raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input: parsed,
        });
      }
    }

    // Preserve the raw assistant message so tool_calls are included for OpenAI
    const rawAssistantMessage: Message = {
      role: "assistant",
      content: choice.message.content ?? null,
      ...(choice.message.tool_calls
        ? {
            tool_calls: choice.message.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          }
        : {}),
    };

    return {
      content: contentBlocks,
      toolCalls,
      stopReason: choice.finish_reason ?? "stop",
      rawAssistantMessage,
    };
  }

  makeToolResultMessage(toolCallId: string, result: string): Message {
    return {
      role: "tool",
      content: result,
      tool_call_id: toolCallId,
    };
  }
}

registerProvider("openai", () => new OpenAIProvider());
