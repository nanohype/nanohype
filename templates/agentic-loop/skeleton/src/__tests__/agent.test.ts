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

  it("recovers from tool execution errors and continues the loop", async () => {
    // Register a tool that throws on certain input
    registry.register({
      name: "risky_operation",
      description: "An operation that may fail",
      inputSchema: z.object({ value: z.string() }),
      execute: async (input) => {
        if (input.value === "bad") {
          throw new Error("Connection refused: service unavailable");
        }
        return `Processed: ${input.value}`;
      },
    });

    // First LLM call: request the risky tool with bad input
    mockSendMessage.mockResolvedValueOnce(
      toolCallResponse("risky_operation", { value: "bad" }, "call_err_1"),
    );
    // Second LLM call: after seeing the error, request the tool again with good input
    mockSendMessage.mockResolvedValueOnce(
      toolCallResponse("risky_operation", { value: "good" }, "call_err_2"),
    );
    // Third LLM call: return a final text response
    mockSendMessage.mockResolvedValueOnce(
      textResponse("Operation completed after retry."),
    );

    const provider = getProvider("mock-test");
    const messages: Message[] = [{ role: "user", content: "Run risky operation" }];
    const toolCallLog: string[] = [];
    const toolResults: string[] = [];
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

        let result: string;
        try {
          result = await registry.execute(tc.name, tc.input);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result = `Tool execution failed: ${errorMsg}`;
        }

        toolResults.push(result);
        messages.push(provider.makeToolResultMessage(tc.id, result));
      }
    }

    // The loop should have run 3 iterations: error, retry, final response
    expect(iterations).toBe(3);
    expect(finalResponse).toBe("Operation completed after retry.");
    expect(toolCallLog).toEqual(["risky_operation", "risky_operation"]);

    // First tool result should be an error message (registry.execute catches and returns error string)
    expect(toolResults[0]).toContain("Error executing tool");
    expect(toolResults[0]).toContain("Connection refused");

    // Second tool result should be successful
    expect(toolResults[1]).toBe("Processed: good");

    // Verify the error was passed back to the LLM in the conversation
    const secondCallMessages = mockSendMessage.mock.calls[1][1] as Message[];
    const errorToolResult = secondCallMessages.find(
      (m) => m.role === "tool" && typeof m.content === "string" && m.content.includes("Error"),
    );
    expect(errorToolResult).toBeDefined();
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
