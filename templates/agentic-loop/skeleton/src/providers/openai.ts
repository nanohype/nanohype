import OpenAI from "openai";
import { z } from "zod";
import type { Tool } from "../tools/registry.js";
import type {
  LlmProvider,
  Message,
  ContentBlock,
  ToolCall,
  LlmResponse,
  StreamChat,
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

  streamChat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[],
  ): StreamChat {
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    ];

    let resolveResponse!: (value: LlmResponse) => void;
    const response = new Promise<LlmResponse>((resolve) => {
      resolveResponse = resolve;
    });

    const streamPromise = client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: openaiMessages,
      tools: formatTools(tools),
      stream: true,
    });

    async function* chunks(): AsyncGenerator<string> {
      const stream = await streamPromise;

      let contentText = "";
      const toolCallAccumulators = new Map<
        number,
        { id: string; name: string; args: string }
      >();
      let finishReason = "stop";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Yield text deltas as they arrive
        if (delta.content) {
          contentText += delta.content;
          yield delta.content;
        }

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallAccumulators.get(tc.index);
            if (existing) {
              if (tc.function?.arguments) {
                existing.args += tc.function.arguments;
              }
            } else {
              toolCallAccumulators.set(tc.index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                args: tc.function?.arguments ?? "",
              });
            }
          }
        }
      }

      // Build the final response
      const toolCalls: ToolCall[] = [];
      const contentBlocks: ContentBlock[] = [];

      if (contentText) {
        contentBlocks.push({ type: "text", text: contentText });
      }

      const toolCallMessages: { id: string; type: "function" as const; function: { name: string; arguments: string } }[] = [];

      for (const [, tc] of [...toolCallAccumulators.entries()].sort(
        ([a], [b]) => a - b,
      )) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tc.args) as Record<string, unknown>;
        } catch {
          parsed = { _raw: tc.args };
        }
        toolCalls.push({ id: tc.id, name: tc.name, input: parsed });
        toolCallMessages.push({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        });
      }

      const rawAssistantMessage: Message = {
        role: "assistant",
        content: contentText || null,
        ...(toolCallMessages.length > 0 ? { tool_calls: toolCallMessages } : {}),
      };

      resolveResponse({
        content: contentBlocks,
        toolCalls,
        stopReason: finishReason,
        rawAssistantMessage,
      });
    }

    return {
      [Symbol.asyncIterator]: () => chunks(),
      response,
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
