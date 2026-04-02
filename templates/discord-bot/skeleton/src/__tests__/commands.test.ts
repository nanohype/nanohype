import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerProvider, getProvider } from "../providers/registry.js";
import type { LlmProvider, ChatMessage } from "../providers/types.js";

/**
 * Tests for the command handling flow and provider integration.
 *
 * These test the provider registry and chat interface that the command
 * handlers depend on. The Discord client interactions are tested via
 * integration tests with discord.js test utilities.
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

  it("sends a question through the provider", async () => {
    mockChat.mockResolvedValueOnce("TypeScript is a typed superset of JavaScript.");

    const provider = getProvider("mock-test");
    const messages: ChatMessage[] = [
      { role: "user", content: "What is TypeScript?" },
    ];

    const response = await provider.chat("You are a helpful assistant.", messages);

    expect(response).toBe("TypeScript is a typed superset of JavaScript.");
    expect(mockChat).toHaveBeenCalledWith("You are a helpful assistant.", messages);
  });

  it("handles multi-turn conversation context", async () => {
    mockChat
      .mockResolvedValueOnce("Sure, what would you like to know?")
      .mockResolvedValueOnce("Discord.js v14 uses slash commands and the gateway API.");

    const provider = getProvider("mock-test");
    const messages: ChatMessage[] = [];

    messages.push({ role: "user", content: "I have a question about Discord bots" });
    const first = await provider.chat("system", messages);
    messages.push({ role: "assistant", content: first });

    messages.push({ role: "user", content: "How does discord.js work?" });
    const second = await provider.chat("system", messages);

    expect(second).toBe("Discord.js v14 uses slash commands and the gateway API.");

    // Second call should include the full conversation history
    const secondCallMessages = mockChat.mock.calls[1][1] as ChatMessage[];
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[0].role).toBe("user");
    expect(secondCallMessages[1].role).toBe("assistant");
    expect(secondCallMessages[2].role).toBe("user");
  });

  it("handles provider errors gracefully", async () => {
    mockChat.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const provider = getProvider("mock-test");
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await expect(provider.chat("system", messages)).rejects.toThrow("API rate limit exceeded");
  });
});
