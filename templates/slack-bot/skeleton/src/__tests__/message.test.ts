import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerProvider, getProvider } from "../providers/registry.js";
import type { LlmProvider, ChatMessage } from "../providers/types.js";

/**
 * Tests for the message handling flow and provider integration.
 *
 * These test the provider registry and chat interface that the message
 * handler depends on. The Bolt app itself is tested via integration
 * tests with Slack's test utilities.
 */

describe("provider registry", () => {
  let mockChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockChat = vi.fn();

    const mockProvider: LlmProvider = {
      chat: mockChat,
    };

    registerProvider("mock-test", () => mockProvider);
  });

  it("retrieves a registered provider", () => {
    const provider = getProvider("mock-test");
    expect(provider).toBeDefined();
    expect(provider.chat).toBeDefined();
  });

  it("throws for an unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrow("Unknown LLM provider");
  });

  it("sends messages through the provider", async () => {
    mockChat.mockResolvedValueOnce("Hello! I can help with that.");

    const provider = getProvider("mock-test");
    const messages: ChatMessage[] = [
      { role: "user", content: "Can you help me?" },
    ];

    const response = await provider.chat("You are a helpful assistant.", messages);

    expect(response).toBe("Hello! I can help with that.");
    expect(mockChat).toHaveBeenCalledWith("You are a helpful assistant.", messages);
  });

  it("maintains conversation context across messages", async () => {
    mockChat
      .mockResolvedValueOnce("Sure, what about?")
      .mockResolvedValueOnce("TypeScript is a superset of JavaScript with static types.");

    const provider = getProvider("mock-test");
    const messages: ChatMessage[] = [];

    messages.push({ role: "user", content: "I have a question" });
    const first = await provider.chat("system", messages);
    messages.push({ role: "assistant", content: first });

    messages.push({ role: "user", content: "Tell me about TypeScript" });
    const second = await provider.chat("system", messages);

    expect(second).toBe("TypeScript is a superset of JavaScript with static types.");

    // Second call should include the full conversation history
    const secondCallMessages = mockChat.mock.calls[1][1] as ChatMessage[];
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[0].role).toBe("user");
    expect(secondCallMessages[1].role).toBe("assistant");
    expect(secondCallMessages[2].role).toBe("user");
  });
});
