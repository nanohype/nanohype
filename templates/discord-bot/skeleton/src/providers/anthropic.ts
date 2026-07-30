import Anthropic from "@anthropic-ai/sdk";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

const client = new Anthropic();
const cb = createCircuitBreaker();

class AnthropicProvider implements LlmProvider {
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await cb.execute(() =>
      client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    );

    const textBlocks = response.content.filter((b) => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n") || "";
  }
}

registerProvider("anthropic", () => new AnthropicProvider());
