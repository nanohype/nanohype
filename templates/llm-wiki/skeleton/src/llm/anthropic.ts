import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmMessage, LlmOptions } from "./types.js";
import { registerLlmProvider } from "./registry.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is required");
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string> {
    const client = this.getClient();

    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await client.messages.create({
      model: opts?.model ?? DEFAULT_MODEL,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts?.temperature,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: conversationMessages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Anthropic response");
    }

    return textBlock.text;
  }
}

registerLlmProvider("anthropic", () => new AnthropicLlmProvider());
