import Anthropic from "@anthropic-ai/sdk";
import { registerProvider } from "./registry";
import type { AiProvider, ChatMessage } from "./types";

class AnthropicProvider implements AiProvider {
  readonly defaultModel = "claude-sonnet-5";

  async sendMessage(messages: ChatMessage[], apiKey: string, model?: string): Promise<string> {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: model ?? this.defaultModel,
      max_tokens: 4096,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return text;
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
