import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

class AnthropicProvider implements AiProvider {
  readonly defaultModel = "claude-sonnet-4-20250514";

  async sendMessage(messages: ChatMessage[], model?: string): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: model ?? this.defaultModel,
      max_tokens: 4096,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  async *streamMessage(messages: ChatMessage[], model?: string): AsyncIterable<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = client.messages.stream({
      model: model ?? this.defaultModel,
      max_tokens: 4096,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}

registerProvider("anthropic", new AnthropicProvider());
