import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, Message, LlmResponse } from "./types.js";
import { registerProvider } from "./registry.js";

const client = new Anthropic();

class AnthropicProvider implements LlmProvider {
  async sendMessage(
    systemPrompt: string,
    messages: Message[],
  ): Promise<LlmResponse> {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("");

    return {
      content: text,
      stopReason: response.stop_reason ?? "end_turn",
    };
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
