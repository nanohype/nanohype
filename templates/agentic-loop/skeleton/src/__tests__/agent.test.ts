import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import type {
  LlmProvider,
  LlmResponse,
  Message,
  StreamChat,
} from "../providers/types.js";
import { registerProvider, getProvider } from "../providers/registry.js";
import { ToolRegistry, type Tool } from "../tools/registry.js";

/**
 * Build a text-only LlmResponse with no tool calls.
 */
function textResponse(text: string): LlmResponse {
  return {
    content: [{ type: "text", text }],
    toolCalls: [],
    stopReason: "end_turn",
    rawAssistantMessage: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  };
}

/**
 * Build an LlmResponse that requests a single tool call.
 */
function toolCallResponse(
  toolName: string,
  input: Record<string, unknown>,
  callId = "call_001",
): LlmResponse {
  return {
    content: [
      { type: "tool_use", id: callId, name: toolName, input },
    ],
    toolCalls: [{ id: callId, name: toolName, input }],
    stopReason: "tool_use",
    rawAssistantMessage: {
      role: "assistant",
      content: [
        { type: "tool_use", id: callId, name: toolName, input },
      ],
    },
  };
}

describe("agent loop integration", () => {
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let registry: ToolRegistry;

  beforeEach(() => {
    mockSendMessage = vi.fn();

    const mockProvider: LlmProvider = {
      sendMessage: mockSendMessage,
      streamChat(): StreamChat {
        throw new Error("streamChat not implemented in mock");
      },
      makeToolResultMessage(toolCallId: string, result: string): Message {
        return {
          role: "tool",
          content: result,
          tool_call_id: toolCallId,
        };
      },
    };

    registerProvider("mock-test", () => mockProvider);

    registry = new ToolRegistry();
    registry.register({
      name: "greet",
      description: "Greets a person",
      inputSchema: z.object({ name: z.string() }),
      execute: async (input) => `Hello, ${input.name}!`,
    });
  });

  it("executes a tool call and returns the final response", async () => {
    // First LLM call: request the greet tool
    mockSendMessage.mockResolvedValueOnce(
      toolCallResponse("greet", { name: "Alice" }),
    );
    // Second LLM call: return a text response after seeing the tool result
    mockSendMessage.mockResolvedValueOnce(
      textResponse("I greeted Alice for you."),
    );

    const provider = getProvider("mock-test");
    const messages: Message[] = [{ role: "user", content: "Say hi to Alice" }];
    const toolCallLog: string[] = [];
    const maxIterations = 10;
    let iterations = 0;
    let finalResponse = "";

    while (iterations < maxIterations) {
      iterations++;

      const llmResponse = await provider.sendMessage("system", messages, registry.list());
      messages.push(llmResponse.rawAssistantMessage);

      if (llmResponse.toolCalls.length === 0) {
        finalResponse = llmResponse.content
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text!)
          .join("\n");
        break;
      }

      for (const tc of llmResponse.toolCalls) {
        toolCallLog.push(tc.name);
        const result = await registry.execute(tc.name, tc.input);
        messages.push(provider.makeToolResultMessage(tc.id, result));
      }
    }

    expect(finalResponse).toBe("I greeted Alice for you.");
    expect(toolCallLog).toEqual(["greet"]);
    expect(iterations).toBe(2);

    // Verify the tool result was passed back to the LLM
    const secondCallMessages = mockSendMessage.mock.calls[1][1] as Message[];
    const toolResultMsg = secondCallMessages.find((m) => m.role === "tool");
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.content).toBe("Hello, Alice!");
  });

  it("respects the max iterations limit", async () => {
    // Provider always requests a tool call, never returns text
    mockSendMessage.mockResolvedValue(
      toolCallResponse("greet", { name: "Loop" }),
    );

    const provider = getProvider("mock-test");
    const messages: Message[] = [{ role: "user", content: "loop forever" }];
    const maxIterations = 3;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const llmResponse = await provider.sendMessage("system", messages, registry.list());
      messages.push(llmResponse.rawAssistantMessage);

      if (llmResponse.toolCalls.length === 0) {
        break;
      }

      for (const tc of llmResponse.toolCalls) {
        const result = await registry.execute(tc.name, tc.input);
        messages.push(provider.makeToolResultMessage(tc.id, result));
      }
    }

    expect(iterations).toBe(maxIterations);
    // One LLM call per iteration
    expect(mockSendMessage).toHaveBeenCalledTimes(maxIterations);
  });
});
